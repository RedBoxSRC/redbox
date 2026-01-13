import { StateMachine } from "@redbox/core";
export interface MessagesState {
    messages: {
        message: string;
        sender?: string;
    }[];
}
export declare const MessagesStateMachine: StateMachine<MessagesState>;
export default MessagesStateMachine;
//# sourceMappingURL=index.d.ts.map