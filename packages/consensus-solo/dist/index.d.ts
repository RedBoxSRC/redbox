import { ConsensusModule, Validator } from "@redbox/core";
export interface SoloConfig {
    validator: Validator;
}
export declare class SoloConsensus implements ConsensusModule {
    readonly type = "solo";
    private validator;
    constructor(cfg: SoloConfig);
    getProposer(_height: number): Validator;
    isProposer(pubKey: string, _height: number): boolean;
    validators(): Validator[];
}
//# sourceMappingURL=index.d.ts.map