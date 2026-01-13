"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesStateMachine = void 0;
exports.MessagesStateMachine = {
    name: "messages",
    initState(_genesis) {
        return { messages: [] };
    },
    validateTx(_state, tx) {
        if (tx.type !== "message") {
            throw new Error("Invalid tx type for messages");
        }
        const message = tx.payload?.message;
        if (typeof message !== "string" || message.length === 0) {
            throw new Error("Message must be non-empty string");
        }
    },
    applyTx(state, tx) {
        return {
            messages: [...state.messages, { message: tx.payload.message, sender: tx.payload.sender }]
        };
    }
};
exports.default = exports.MessagesStateMachine;
