import { EventEmitter } from "events";
import { Transaction } from "./types";
export declare class Mempool extends EventEmitter {
    private txs;
    add(tx: Transaction): boolean;
    all(): Transaction[];
    take(max: number): Transaction[];
    remove(ids: string[]): void;
    clear(): void;
}
//# sourceMappingURL=mempool.d.ts.map