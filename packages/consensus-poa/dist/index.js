"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoAConsensus = void 0;
class PoAConsensus {
    constructor(cfg) {
        this.type = "poa";
        if (!cfg.validators.length) {
            throw new Error("PoA requires at least one validator");
        }
        this.list = cfg.validators;
    }
    getProposer(height) {
        const index = (height - 1) % this.list.length;
        return this.list[index];
    }
    isProposer(pubKey, height) {
        return this.getProposer(height).pubKey === pubKey;
    }
    validators() {
        return this.list;
    }
}
exports.PoAConsensus = PoAConsensus;
