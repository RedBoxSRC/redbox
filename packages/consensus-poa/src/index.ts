import { ConsensusModule, Validator } from "@redbox/core";

export interface PoAConfig {
  validators: Validator[];
}

export class PoAConsensus implements ConsensusModule {
  readonly type = "poa";
  private readonly list: Validator[];

  constructor(cfg: PoAConfig) {
    if (!cfg.validators.length) {
      throw new Error("PoA requires at least one validator");
    }
    this.list = cfg.validators;
  }

  getProposer(height: number): Validator {
    const index = (height - 1) % this.list.length;
    return this.list[index];
  }

  isProposer(pubKey: string, height: number): boolean {
    return this.getProposer(height).pubKey === pubKey;
  }

  validators(): Validator[] {
    return this.list;
  }
}
