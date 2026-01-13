import { ConsensusModule, Validator } from "@redbox/core";

export interface SoloConfig {
  validator: Validator;
}

export class SoloConsensus implements ConsensusModule {
  readonly type = "solo";
  private validator: Validator;

  constructor(cfg: SoloConfig) {
    this.validator = cfg.validator;
  }

  getProposer(_height: number): Validator {
    return this.validator;
  }

  isProposer(pubKey: string, _height: number): boolean {
    return pubKey === this.validator.pubKey;
  }

  validators(): Validator[] {
    return [this.validator];
  }
}
