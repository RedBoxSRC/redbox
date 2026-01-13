import { ConsensusModule, Validator } from "@redbox/core";
export interface PoAConfig {
    validators: Validator[];
}
export declare class PoAConsensus implements ConsensusModule {
    readonly type = "poa";
    private readonly list;
    constructor(cfg: PoAConfig);
    getProposer(height: number): Validator;
    isProposer(pubKey: string, height: number): boolean;
    validators(): Validator[];
}
//# sourceMappingURL=index.d.ts.map