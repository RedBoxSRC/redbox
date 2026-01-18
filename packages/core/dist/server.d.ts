import { ApiConfig, Block, Transaction } from "./types";
type NodeHandle = {
    getStatus(): any;
    getState(): any;
    getStateAtHeight(height?: number): Promise<{
        height: number;
        state: any;
    } | undefined>;
    addTransaction(tx: Transaction): Promise<{
        accepted: boolean;
        id: string;
    }>;
    getBlock(height: number): Promise<Block | undefined>;
    getLatestBlock(): Promise<Block | undefined>;
    getBlocks(from: number, to: number): Promise<Block[]>;
    exportSnapshot(height?: number): Promise<{
        chainId: string;
        height: number;
        blockHash: string | null;
        state: any;
    } | undefined>;
    on(event: string, handler: (...args: any[]) => void): any;
    off?(event: string, handler: (...args: any[]) => void): any;
};
export interface ApiServer {
    stop(): Promise<void>;
}
export declare function startApiServer(node: NodeHandle, config: ApiConfig): Promise<ApiServer>;
export {};
//# sourceMappingURL=server.d.ts.map