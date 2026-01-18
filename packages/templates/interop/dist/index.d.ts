import { StateMachine } from "@redbox/core";
interface IntegrationChain {
    endpoint: string;
    metadata?: Record<string, any>;
    enabled: boolean;
}
interface OutboxMessage {
    id: string;
    to: string;
    payload: Record<string, any>;
    acked: boolean;
    sender: string;
}
interface InboxMessage {
    id: string;
    from: string;
    payload: Record<string, any>;
    acked: boolean;
    sender: string;
}
export interface IntegrationState {
    chains: Record<string, IntegrationChain>;
    outbox: OutboxMessage[];
    inbox: InboxMessage[];
    nextMessageId: number;
    admins: string[];
}
export declare const IntegrationStateMachine: StateMachine<IntegrationState>;
export default IntegrationStateMachine;
//# sourceMappingURL=index.d.ts.map