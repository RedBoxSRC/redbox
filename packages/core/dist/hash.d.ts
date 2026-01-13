import { Block, Transaction } from "./types";
export declare function canonicalJson(value: any): string;
export declare function hashObject(value: any): string;
export declare function calculateTxId(tx: Omit<Transaction, "id"> | Transaction): string;
export declare function calculateBlockHash(block: Omit<Block, "blockHash" | "signature">): string;
//# sourceMappingURL=hash.d.ts.map