import { EventEmitter } from "events";
import { calculateBlockHash, calculateTxId } from "./hash";
import { signMessage, verifyMessage } from "./crypto";
import { Mempool } from "./mempool";
import {
  ApiConfig,
  Block,
  BlockStore,
  ConsensusModule,
  GenesisData,
  NewBlockEvent,
  NodeConfig,
  P2PAdapter,
  P2PConfig,
  StateMachine,
  Transaction
} from "./types";
import { startApiServer, ApiServer } from "./server";

const DEFAULT_BLOCK_TIME = 2000;

export class RedboxNode extends EventEmitter {
  private chainId: string;
  private mempool: Mempool;
  private consensus: ConsensusModule;
  private stateMachine: StateMachine;
  private storage: BlockStore;
  private key: { pubKey: string; privKey: string };
  private genesis: GenesisData;
  private blockTimeMs: number;
  private apiConfig?: ApiConfig;
  private p2pConfig?: P2PConfig;
  private p2p?: P2PAdapter;
  private apiServer?: ApiServer;
  private running = false;
  private produceTimer?: NodeJS.Timeout;
  private latestState?: { height: number; state: any };
  private processingBlocks: Promise<void> = Promise.resolve();

  constructor(config: NodeConfig) {
    super();
    this.chainId = config.chainId;
    this.consensus = config.consensus;
    this.stateMachine = config.stateMachine;
    this.storage = config.storage;
    this.key = config.key;
    this.genesis = config.genesis;
    this.blockTimeMs = config.blockTimeMs ?? DEFAULT_BLOCK_TIME;
    this.apiConfig = config.api;
    this.p2pConfig = config.p2p;
    this.p2p = config.p2pAdapter;
    this.mempool = new Mempool();
  }

  async init(): Promise<void> {
    await this.storage.init();
    const latest = await this.storage.getLatestState();
    if (!latest) {
      const initialState = this.stateMachine.initState(this.genesis);
      this.latestState = { height: 0, state: initialState };
      // store genesis state for height 0
      const genesisTimestamp = 0;
      await this.storage.putBlock(
        {
          height: 0,
          timestamp: genesisTimestamp,
          prevHash: null,
          txs: [],
          proposerPubKey: this.key.pubKey,
          signature: "",
          blockHash: calculateBlockHash({
            height: 0,
            timestamp: genesisTimestamp,
            prevHash: null,
            txs: [],
            proposerPubKey: this.key.pubKey
          })
        },
        initialState
      );
    } else {
      this.latestState = latest;
    }
    if (this.p2p) {
      this.wireP2P(this.p2p);
      await this.p2p.start();
    }
    if (this.apiConfig) {
      this.apiServer = await startApiServer(this, this.apiConfig);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.init();
    this.scheduleProducer();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.produceTimer) {
      clearInterval(this.produceTimer);
    }
    if (this.apiServer) {
      await this.apiServer.stop();
    }
    if (this.p2p) {
      await this.p2p.stop();
    }
  }

  private scheduleProducer(): void {
    this.produceTimer = setInterval(() => {
      this.tryProduceBlock().catch((err) => this.emit("error", err));
    }, this.blockTimeMs);
  }

  private getLatestHeight(): number {
    return this.latestState?.height ?? 0;
  }

  async addTransaction(tx: Transaction): Promise<{ accepted: boolean; id: string }> {
    const id = tx.id || calculateTxId(tx);
    const normalized = { ...tx, id };
    const currentState = this.latestState?.state;
    await this.stateMachine.validateTx(currentState, normalized);
    const added = this.mempool.add(normalized);
    if (added && this.p2p) {
      this.p2p.broadcastTx(normalized);
    }
    if (added) {
      this.emit("tx", normalized);
    }
    return { accepted: added, id };
  }

  getState(): any {
    return this.latestState?.state;
  }

  getHeight(): number {
    return this.getLatestHeight();
  }

  getStatus() {
    return {
      chainId: this.chainId,
      height: this.getLatestHeight(),
      mempool: this.mempool.all().length,
      consensus: this.consensus.type,
      validators: this.consensus.validators().map((v) => v.pubKey)
    };
  }

  getBlock = async (height: number): Promise<Block | undefined> => {
    return this.storage.getBlock(height);
  };

  getLatestBlock = async (): Promise<Block | undefined> => {
    const height = this.getLatestHeight();
    return this.storage.getBlock(height);
  };

  private async tryProduceBlock(): Promise<void> {
    if (!this.running) return;
    const nextHeight = this.getLatestHeight() + 1;
    const proposer = this.consensus.getProposer(nextHeight);
    if (proposer.pubKey !== this.key.pubKey) {
      return;
    }
    const txs = this.mempool.take(100);
    if (txs.length === 0) return;
    await this.createAndCommitBlock(txs, nextHeight);
  }

  async createAndCommitBlock(txs: Transaction[], height: number): Promise<Block> {
    const prevBlock = await this.storage.getBlock(height - 1);
    const prevHash = prevBlock ? prevBlock.blockHash : null;
    let workingState = this.latestState?.state;
    if (!workingState) {
      throw new Error("State not initialized");
    }
    const applied: Transaction[] = [];
    for (const tx of txs) {
      const id = tx.id || calculateTxId(tx);
      const normalized = { ...tx, id };
      await this.stateMachine.validateTx(workingState, normalized);
      workingState = this.stateMachine.applyTx(workingState, normalized);
      applied.push(normalized);
    }
    const draft: Omit<Block, "blockHash" | "signature"> = {
      height,
      timestamp: Date.now(),
      prevHash,
      txs: applied,
      proposerPubKey: this.key.pubKey
    };
    const blockHash = calculateBlockHash(draft);
    const signature = await signMessage(blockHash, this.key.privKey);
    const block: Block = { ...draft, blockHash, signature };
    await this.commitBlock(block, workingState);
    return block;
  }

  private async commitBlock(block: Block, state: any): Promise<void> {
    await this.storage.putBlock(block, state);
    this.latestState = { height: block.height, state };
    this.emit("block", { block, state } as NewBlockEvent);
    if (this.p2p) {
      this.p2p.broadcastBlock(block);
    }
    this.mempool.remove(block.txs.map((t) => t.id));
  }

  async handleRemoteTx(tx: Transaction): Promise<void> {
    try {
      await this.addTransaction(tx);
    } catch (err) {
      this.emit("warn", `Rejecting tx ${tx.id}: ${(err as Error).message}`);
    }
  }

  async handleRemoteBlock(block: Block): Promise<void> {
    this.processingBlocks = this.processingBlocks
      .then(() => this.validateAndApplyBlock(block))
      .catch((err) => {
        this.emit("warn", `Rejecting block ${block.height}: ${(err as Error).message}`);
      });
    await this.processingBlocks;
  }

  private async validateAndApplyBlock(block: Block): Promise<void> {
    const expectedHash = calculateBlockHash({
      height: block.height,
      timestamp: block.timestamp,
      prevHash: block.prevHash,
      txs: block.txs,
      proposerPubKey: block.proposerPubKey
    });
    if (expectedHash !== block.blockHash) {
      throw new Error("Invalid block hash");
    }
    const signatureValid = await verifyMessage(block.blockHash, block.signature, block.proposerPubKey);
    if (!signatureValid) {
      throw new Error("Invalid proposer signature");
    }
    if (!this.consensus.isProposer(block.proposerPubKey, block.height)) {
      throw new Error("Unexpected proposer");
    }
    const prevBlock = await this.storage.getBlock(block.height - 1);
    const prevHash = prevBlock ? prevBlock.blockHash : null;
    if (block.height === 1 && prevHash === null) {
      // ok genesis connection
    } else if (block.prevHash !== prevHash) {
      throw new Error("Prev hash mismatch");
    }
    if (block.height !== this.getLatestHeight() + 1) {
      // simple sync guard: ignore out-of-order blocks
      if (block.height <= this.getLatestHeight()) return;
      throw new Error("Out of order block");
    }
    let workingState = this.latestState?.state;
    if (!workingState) throw new Error("Missing local state");
    for (const tx of block.txs) {
      await this.stateMachine.validateTx(workingState, tx);
      workingState = this.stateMachine.applyTx(workingState, tx);
    }
    await this.commitBlock(block, workingState);
  }

  private wireP2P(adapter: P2PAdapter): void {
    adapter
      .on("tx", (tx: Transaction) => this.handleRemoteTx(tx))
      .on("block", (block: Block) => this.handleRemoteBlock(block));
  }
}
