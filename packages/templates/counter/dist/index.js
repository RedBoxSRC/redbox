"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CounterStateMachine = void 0;
exports.CounterStateMachine = {
    name: "counter",
    initState(genesis) {
        const initial = genesis.appState?.value ?? 0;
        return { value: initial };
    },
    validateTx(_state, tx) {
        if (!["inc", "dec"].includes(tx.type)) {
            throw new Error("Invalid tx type for counter");
        }
        const amt = Number(tx.payload?.amount ?? 1);
        if (!Number.isFinite(amt) || amt <= 0) {
            throw new Error("Amount must be positive number");
        }
    },
    applyTx(state, tx) {
        const amt = Number(tx.payload?.amount ?? 1);
        const next = { ...state };
        if (tx.type === "inc") {
            next.value += amt;
        }
        else if (tx.type === "dec") {
            next.value -= amt;
        }
        return next;
    }
};
exports.default = exports.CounterStateMachine;
