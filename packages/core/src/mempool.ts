import { EventEmitter } from "events";
import { Transaction } from "./types";

export class Mempool extends EventEmitter {
  private txs: Map<string, Transaction> = new Map();

  add(tx: Transaction): boolean {
    if (this.txs.has(tx.id)) {
      return false;
    }
    this.txs.set(tx.id, tx);
    this.emit("tx", tx);
    return true;
  }

  all(): Transaction[] {
    return Array.from(this.txs.values());
  }

  take(max: number): Transaction[] {
    const list = Array.from(this.txs.values()).slice(0, max);
    for (const tx of list) {
      this.txs.delete(tx.id);
    }
    return list;
  }

  remove(ids: string[]): void {
    for (const id of ids) {
      this.txs.delete(id);
    }
  }

  clear(): void {
    this.txs.clear();
  }
}
