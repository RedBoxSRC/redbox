import { Block, BlockStore } from "@redbox/core";
export declare class LevelBlockStore implements BlockStore {
    private path;
    private db;
    private initialized;
    constructor(path: string);
    init(): Promise<void>;
    getLatestHeight(): Promise<number>;
    getBlock(height: number): Promise<Block | undefined>;
    putBlock(block: Block, stateSnapshot: any): Promise<void>;
    getState(height: number): Promise<any | undefined>;
    getLatestState(): Promise<{
        height: number;
        state: any;
    } | undefined>;
}
//# sourceMappingURL=index.d.ts.map