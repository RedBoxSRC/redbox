"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedboxNode = void 0;
const events_1 = require("events");
const hash_1 = require("./hash");
const crypto_1 = require("./crypto");
const mempool_1 = require("./mempool");
const server_1 = require("./server");
const DEFAULT_BLOCK_TIME = 2000;
class RedboxNode extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.running = false;
        this.processingBlocks = Promise.resolve();
        this.getBlock = async (height) => {
            return this.storage.getBlock(height);
        };
        this.getLatestBlock = async () => {
            const height = this.getLatestHeight();
            return this.storage.getBlock(height);
        };
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
        this.mempool = new mempool_1.Mempool();
    }
    async init() {
        await this.storage.init();
        const latest = await this.storage.getLatestState();
        if (!latest) {
            const initialState = this.stateMachine.initState(this.genesis);
            this.latestState = { height: 0, state: initialState };
            // store genesis state for height 0
            const genesisTimestamp = 0;
            await this.storage.putBlock({
                height: 0,
                timestamp: genesisTimestamp,
                prevHash: null,
                txs: [],
                proposerPubKey: this.key.pubKey,
                signature: "",
                blockHash: (0, hash_1.calculateBlockHash)({
                    height: 0,
                    timestamp: genesisTimestamp,
                    prevHash: null,
                    txs: [],
                    proposerPubKey: this.key.pubKey
                })
            }, initialState);
        }
        else {
            this.latestState = latest;
        }
        if (this.p2p) {
            this.wireP2P(this.p2p);
            await this.p2p.start();
        }
        if (this.apiConfig) {
            this.apiServer = await (0, server_1.startApiServer)(this, this.apiConfig);
        }
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        await this.init();
        this.scheduleProducer();
    }
    async stop() {
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
    scheduleProducer() {
        this.produceTimer = setInterval(() => {
            this.tryProduceBlock().catch((err) => this.emit("error", err));
        }, this.blockTimeMs);
    }
    getLatestHeight() {
        return this.latestState?.height ?? 0;
    }
    async addTransaction(tx) {
        const id = tx.id || (0, hash_1.calculateTxId)(tx);
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
    getState() {
        return this.latestState?.state;
    }
    getHeight() {
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
    async tryProduceBlock() {
        if (!this.running)
            return;
        const nextHeight = this.getLatestHeight() + 1;
        const proposer = this.consensus.getProposer(nextHeight);
        if (proposer.pubKey !== this.key.pubKey) {
            return;
        }
        const txs = this.mempool.take(100);
        if (txs.length === 0)
            return;
        await this.createAndCommitBlock(txs, nextHeight);
    }
    async createAndCommitBlock(txs, height) {
        const prevBlock = await this.storage.getBlock(height - 1);
        const prevHash = prevBlock ? prevBlock.blockHash : null;
        let workingState = this.latestState?.state;
        if (!workingState) {
            throw new Error("State not initialized");
        }
        const applied = [];
        for (const tx of txs) {
            const id = tx.id || (0, hash_1.calculateTxId)(tx);
            const normalized = { ...tx, id };
            await this.stateMachine.validateTx(workingState, normalized);
            workingState = this.stateMachine.applyTx(workingState, normalized);
            applied.push(normalized);
        }
        const draft = {
            height,
            timestamp: Date.now(),
            prevHash,
            txs: applied,
            proposerPubKey: this.key.pubKey
        };
        const blockHash = (0, hash_1.calculateBlockHash)(draft);
        const signature = await (0, crypto_1.signMessage)(blockHash, this.key.privKey);
        const block = { ...draft, blockHash, signature };
        await this.commitBlock(block, workingState);
        return block;
    }
    async commitBlock(block, state) {
        await this.storage.putBlock(block, state);
        this.latestState = { height: block.height, state };
        this.emit("block", { block, state });
        if (this.p2p) {
            this.p2p.broadcastBlock(block);
        }
        this.mempool.remove(block.txs.map((t) => t.id));
    }
    async handleRemoteTx(tx) {
        try {
            await this.addTransaction(tx);
        }
        catch (err) {
            this.emit("warn", `Rejecting tx ${tx.id}: ${err.message}`);
        }
    }
    async handleRemoteBlock(block) {
        this.processingBlocks = this.processingBlocks
            .then(() => this.validateAndApplyBlock(block))
            .catch((err) => {
            this.emit("warn", `Rejecting block ${block.height}: ${err.message}`);
        });
        await this.processingBlocks;
    }
    async validateAndApplyBlock(block) {
        const expectedHash = (0, hash_1.calculateBlockHash)({
            height: block.height,
            timestamp: block.timestamp,
            prevHash: block.prevHash,
            txs: block.txs,
            proposerPubKey: block.proposerPubKey
        });
        if (expectedHash !== block.blockHash) {
            throw new Error("Invalid block hash");
        }
        const signatureValid = await (0, crypto_1.verifyMessage)(block.blockHash, block.signature, block.proposerPubKey);
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
        }
        else if (block.prevHash !== prevHash) {
            throw new Error("Prev hash mismatch");
        }
        if (block.height !== this.getLatestHeight() + 1) {
            // simple sync guard: ignore out-of-order blocks
            if (block.height <= this.getLatestHeight())
                return;
            throw new Error("Out of order block");
        }
        let workingState = this.latestState?.state;
        if (!workingState)
            throw new Error("Missing local state");
        for (const tx of block.txs) {
            await this.stateMachine.validateTx(workingState, tx);
            workingState = this.stateMachine.applyTx(workingState, tx);
        }
        await this.commitBlock(block, workingState);
    }
    wireP2P(adapter) {
        adapter
            .on("tx", (tx) => this.handleRemoteTx(tx))
            .on("block", (block) => this.handleRemoteBlock(block));
    }
}
exports.RedboxNode = RedboxNode;
