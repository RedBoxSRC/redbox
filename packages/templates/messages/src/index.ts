import { GenesisData, StateMachine, Transaction } from "@redbox/core";

export interface MessagesState {
  messages: { message: string; sender?: string }[];
}

export const MessagesStateMachine: StateMachine<MessagesState> = {
  name: "messages",
  initState(_genesis: GenesisData): MessagesState {
    return { messages: [] };
  },
  validateTx(_state: MessagesState, tx: Transaction) {
    if (tx.type !== "message") {
      throw new Error("Invalid tx type for messages");
    }
    const message = tx.payload?.message;
    if (typeof message !== "string" || message.length === 0) {
      throw new Error("Message must be non-empty string");
    }
  },
  applyTx(state: MessagesState, tx: Transaction): MessagesState {
    return {
      messages: [...state.messages, { message: tx.payload.message, sender: tx.payload.sender }]
    };
  }
};

export default MessagesStateMachine;
