import { StateMachine } from "@redbox/core";
export interface LedgerState {
    balances: Record<string, number>;
}
export declare const LedgerStateMachine: StateMachine<LedgerState>;
export default LedgerStateMachine;
//# sourceMappingURL=index.d.ts.map