import { EventEmitter } from "events";
import { Block, NodeConfig, Transaction } from "./types";
export declare class RedboxNode extends EventEmitter {
    private chainId;
    private mempool;
    private consensus;
    private stateMachine;
    private storage;
    private key;
    private genesis;
    private blockTimeMs;
    private apiConfig?;
    private p2pConfig?;
    private p2p?;
    private apiServer?;
    private running;
    private produceTimer?;
    private latestState?;
    private processingBlocks;
    private latestBlockHash?;
    constructor(config: NodeConfig);
    init(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    private scheduleProducer;
    private getLatestHeight;
    addTransaction(tx: Transaction): Promise<{
        accepted: boolean;
        id: string;
    }>;
    getState(): any;
    getHeight(): number;
    getStatus(): {
        chainId: string;
        height: number;
        latestBlockHash: string | null;
        mempool: number;
        consensus: string;
        validators: string[];
    };
    getBlock: (height: number) => Promise<Block | undefined>;
    getLatestBlock: () => Promise<Block | undefined>;
    getBlocks(from: number, to: number): Promise<Block[]>;
    getStateAtHeight(height?: number): Promise<{
        height: number;
        state: any;
    } | undefined>;
    exportSnapshot(height?: number): Promise<{
        chainId: string;
        height: number;
        blockHash: string | null;
        state: any;
    } | undefined>;
    private tryProduceBlock;
    createAndCommitBlock(txs: Transaction[], height: number): Promise<Block>;
    private commitBlock;
    handleRemoteTx(tx: Transaction): Promise<void>;
    handleRemoteBlock(block: Block): Promise<void>;
    private validateAndApplyBlock;
    private wireP2P;
}
//# sourceMappingURL=node.d.ts.map