"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerStateMachine = void 0;
const core_1 = require("@redbox/core");
exports.LedgerStateMachine = {
    name: "ledger",
    initState(genesis) {
        const balances = genesis.appState?.balances ?? {};
        return { balances: { ...balances } };
    },
    async validateTx(state, tx) {
        if (tx.type !== "transfer") {
            throw new Error("Invalid tx type for ledger");
        }
        if (!tx.senderPubKey || !tx.signature) {
            throw new Error("Transfer requires senderPubKey and signature");
        }
        const to = tx.payload?.to;
        const amount = Number(tx.payload?.amount);
        if (typeof to !== "string" || to.length === 0) {
            throw new Error("Missing recipient");
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Amount must be > 0");
        }
        const messageHex = tx.id;
        const ok = await (0, core_1.verifyMessage)(messageHex, tx.signature, tx.senderPubKey);
        if (!ok) {
            throw new Error("Invalid signature");
        }
        const senderBal = state.balances[tx.senderPubKey] ?? 0;
        if (senderBal < amount) {
            throw new Error("Insufficient balance");
        }
    },
    applyTx(state, tx) {
        const to = tx.payload.to;
        const amount = Number(tx.payload.amount);
        const balances = { ...state.balances };
        balances[tx.senderPubKey] = (balances[tx.senderPubKey] ?? 0) - amount;
        balances[to] = (balances[to] ?? 0) + amount;
        return { balances };
    }
};
exports.default = exports.LedgerStateMachine;
