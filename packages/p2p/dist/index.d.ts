import { EventEmitter } from "events";
import { Block, P2PAdapter, Transaction } from "@redbox/core";
export interface P2PNodeOptions {
    port: number;
    seeds?: string[];
    chainId: string;
    getLatestHeight: () => number;
    getBlock: (height: number) => Promise<Block | undefined>;
}
export declare class P2PNode extends EventEmitter implements P2PAdapter {
    private opts;
    private peers;
    private server?;
    private seedSockets;
    private reconnectTimer?;
    constructor(opts: P2PNodeOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    broadcastTx(tx: Transaction): void;
    broadcastBlock(block: Block): void;
    private handleConnection;
    private connectToSeed;
    private retrySeeds;
    private handleMessage;
    private send;
    private broadcast;
}
//# sourceMappingURL=index.d.ts.map