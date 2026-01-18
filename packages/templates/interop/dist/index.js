"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationStateMachine = void 0;
const core_1 = require("@redbox/core");
function ensureSignature(tx) {
    if (!tx.senderPubKey || !tx.signature) {
        throw new Error("Interop txs must include senderPubKey and signature");
    }
}
async function validateSignature(tx) {
    ensureSignature(tx);
    const ok = await (0, core_1.verifyMessage)(tx.id, tx.signature, tx.senderPubKey);
    if (!ok)
        throw new Error("Invalid signature");
}
exports.IntegrationStateMachine = {
    name: "interop",
    initState(genesis) {
        const app = genesis.appState ?? {};
        return {
            chains: app.chains ?? {},
            outbox: app.outbox ?? [],
            inbox: app.inbox ?? [],
            nextMessageId: app.nextMessageId ?? 0,
            admins: app.admins ?? []
        };
    },
    async validateTx(state, tx) {
        if (!tx.type)
            throw new Error("Missing tx type");
        ensureSignature(tx);
        await validateSignature(tx);
        const sender = tx.senderPubKey;
        if (state.admins.length > 0 && !state.admins.includes(sender)) {
            throw new Error("Sender not authorized for interop actions");
        }
        switch (tx.type) {
            case "register-chain": {
                const chainId = tx.payload?.chainId;
                const endpoint = tx.payload?.endpoint;
                if (typeof chainId !== "string" || chainId.length === 0) {
                    throw new Error("register-chain requires chainId");
                }
                if (state.chains[chainId]) {
                    throw new Error("chain already registered");
                }
                if (typeof endpoint !== "string" || endpoint.length === 0) {
                    throw new Error("register-chain requires endpoint");
                }
                break;
            }
            case "route-msg": {
                const to = tx.payload?.to;
                if (typeof to !== "string" || to.length === 0) {
                    throw new Error("route-msg requires destination chain id");
                }
                const chain = state.chains[to];
                if (!chain)
                    throw new Error("unknown destination chain");
                if (!chain.enabled)
                    throw new Error("destination chain disabled");
                if (typeof tx.payload?.data === "undefined") {
                    throw new Error("route-msg requires data payload");
                }
                const proposedId = tx.payload?.id;
                if (typeof proposedId === "string") {
                    const duplicate = state.outbox.find((m) => m.id === proposedId);
                    if (duplicate)
                        throw new Error("message id already used");
                }
                break;
            }
            case "ack-msg": {
                const id = tx.payload?.id;
                if (typeof id !== "string" || id.length === 0)
                    throw new Error("ack-msg requires id");
                const existing = state.outbox.find((m) => m.id === id);
                if (!existing)
                    throw new Error("ack target not found");
                break;
            }
            case "ingest-msg": {
                const from = tx.payload?.from;
                const id = tx.payload?.id;
                if (typeof from !== "string" || from.length === 0) {
                    throw new Error("ingest-msg requires source chain id");
                }
                if (typeof id !== "string" || id.length === 0) {
                    throw new Error("ingest-msg requires message id");
                }
                const duplicate = state.inbox.find((m) => m.id === id && m.from === from);
                if (duplicate)
                    throw new Error("message already ingested");
                if (typeof tx.payload?.data === "undefined") {
                    throw new Error("ingest-msg requires data payload");
                }
                break;
            }
            default:
                throw new Error("Unsupported interop tx type");
        }
    },
    applyTx(state, tx) {
        const chains = { ...state.chains };
        const outbox = [...state.outbox];
        const inbox = [...state.inbox];
        let nextMessageId = state.nextMessageId ?? 0;
        switch (tx.type) {
            case "register-chain": {
                const chainId = tx.payload.chainId;
                chains[chainId] = {
                    endpoint: tx.payload.endpoint,
                    metadata: tx.payload.metadata ?? {},
                    enabled: tx.payload.enabled ?? true
                };
                break;
            }
            case "route-msg": {
                const id = tx.payload.id ?? `msg-${nextMessageId}`;
                nextMessageId += 1;
                outbox.push({
                    id,
                    to: tx.payload.to,
                    payload: { data: tx.payload.data, memo: tx.payload.memo },
                    acked: false,
                    sender: tx.senderPubKey
                });
                break;
            }
            case "ack-msg": {
                const id = tx.payload.id;
                const idx = outbox.findIndex((m) => m.id === id);
                if (idx >= 0) {
                    outbox[idx] = { ...outbox[idx], acked: true };
                }
                break;
            }
            case "ingest-msg": {
                inbox.push({
                    id: tx.payload.id,
                    from: tx.payload.from,
                    payload: { data: tx.payload.data, memo: tx.payload.memo },
                    acked: !!tx.payload.acked,
                    sender: tx.senderPubKey
                });
                break;
            }
        }
        return { chains, outbox, inbox, nextMessageId, admins: state.admins };
    }
};
exports.default = exports.IntegrationStateMachine;
