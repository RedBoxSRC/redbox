"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mempool = void 0;
const events_1 = require("events");
class Mempool extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.txs = new Map();
    }
    add(tx) {
        if (this.txs.has(tx.id)) {
            return false;
        }
        this.txs.set(tx.id, tx);
        this.emit("tx", tx);
        return true;
    }
    all() {
        return Array.from(this.txs.values());
    }
    take(max) {
        const list = Array.from(this.txs.values()).slice(0, max);
        for (const tx of list) {
            this.txs.delete(tx.id);
        }
        return list;
    }
    remove(ids) {
        for (const id of ids) {
            this.txs.delete(id);
        }
    }
    clear() {
        this.txs.clear();
    }
}
exports.Mempool = Mempool;
