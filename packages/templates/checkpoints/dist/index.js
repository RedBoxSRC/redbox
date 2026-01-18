"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckpointStateMachine = void 0;
const core_1 = require("@redbox/core");
function ensureSigned(tx) {
    if (!tx.senderPubKey || !tx.signature) {
        throw new Error("Checkpoint tx must be signed");
    }
}
exports.CheckpointStateMachine = {
    name: "checkpoints",
    initState(genesis) {
        const app = genesis.appState ?? {};
        return {
            checkpoints: app.checkpoints ?? {},
            aggregators: app.aggregators ?? []
        };
    },
    async validateTx(state, tx) {
        if (tx.type !== "submit-checkpoint") {
            throw new Error("Unsupported tx type for checkpoints");
        }
        ensureSigned(tx);
        const ok = await (0, core_1.verifyMessage)(tx.id, tx.signature, tx.senderPubKey);
        if (!ok)
            throw new Error("Invalid signature");
        if (state.aggregators.length > 0 && !state.aggregators.includes(tx.senderPubKey)) {
            throw new Error("Sender not authorized");
        }
        const chainId = tx.payload?.chainId;
        const height = Number(tx.payload?.height);
        const root = tx.payload?.root;
        if (typeof chainId !== "string" || chainId.length === 0) {
            throw new Error("submit-checkpoint requires chainId");
        }
        if (!Number.isFinite(height) || height < 0) {
            throw new Error("submit-checkpoint requires numeric height");
        }
        if (typeof root !== "string" || root.length === 0) {
            throw new Error("submit-checkpoint requires root");
        }
        const last = (state.checkpoints[chainId] ?? []).slice(-1)[0];
        if (last && height <= last.height) {
            throw new Error("checkpoint height must increase");
        }
    },
    applyTx(state, tx) {
        const chainId = tx.payload.chainId;
        const checkpoints = { ...state.checkpoints };
        const nextForChain = checkpoints[chainId] ? [...checkpoints[chainId]] : [];
        nextForChain.push({
            chainId,
            height: Number(tx.payload.height),
            root: tx.payload.root,
            submittedBy: tx.senderPubKey,
            metadata: tx.payload.metadata ?? {}
        });
        checkpoints[chainId] = nextForChain;
        return { checkpoints, aggregators: state.aggregators };
    }
};
exports.default = exports.CheckpointStateMachine;
