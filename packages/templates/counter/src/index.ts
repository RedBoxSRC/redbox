import { GenesisData, StateMachine, Transaction } from "@redbox/core";

export interface CounterState {
  value: number;
}

export const CounterStateMachine: StateMachine<CounterState> = {
  name: "counter",
  initState(genesis: GenesisData): CounterState {
    const initial = genesis.appState?.value ?? 0;
    return { value: initial };
  },
  validateTx(_state: CounterState, tx: Transaction) {
    if (!["inc", "dec"].includes(tx.type)) {
      throw new Error("Invalid tx type for counter");
    }
    const amt = Number(tx.payload?.amount ?? 1);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error("Amount must be positive number");
    }
  },
  applyTx(state: CounterState, tx: Transaction): CounterState {
    const amt = Number(tx.payload?.amount ?? 1);
    const next = { ...state };
    if (tx.type === "inc") {
      next.value += amt;
    } else if (tx.type === "dec") {
      next.value -= amt;
    }
    return next;
  }
};

export default CounterStateMachine;
