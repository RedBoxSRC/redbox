"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoloConsensus = void 0;
class SoloConsensus {
    constructor(cfg) {
        this.type = "solo";
        this.validator = cfg.validator;
    }
    getProposer(_height) {
        return this.validator;
    }
    isProposer(pubKey, _height) {
        return pubKey === this.validator.pubKey;
    }
    validators() {
        return [this.validator];
    }
}
exports.SoloConsensus = SoloConsensus;
