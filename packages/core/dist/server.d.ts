import { ApiConfig, Block, Transaction } from "./types";
type NodeHandle = {
    getStatus(): any;
    getState(): any;
    addTransaction(tx: Transaction): Promise<{
        accepted: boolean;
        id: string;
    }>;
    getBlock(height: number): Promise<Block | undefined>;
    getLatestBlock(): Promise<Block | undefined>;
    on(event: string, handler: (...args: any[]) => void): any;
    off?(event: string, handler: (...args: any[]) => void): any;
};
export interface ApiServer {
    stop(): Promise<void>;
}
export declare function startApiServer(node: NodeHandle, config: ApiConfig): Promise<ApiServer>;
export {};
//# sourceMappingURL=server.d.ts.map