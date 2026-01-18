import { StateMachine } from "@redbox/core";
export interface Checkpoint {
    chainId: string;
    height: number;
    root: string;
    submittedBy: string;
    metadata?: Record<string, any>;
}
export interface CheckpointState {
    checkpoints: Record<string, Checkpoint[]>;
    aggregators: string[];
}
export declare const CheckpointStateMachine: StateMachine<CheckpointState>;
export default CheckpointStateMachine;
//# sourceMappingURL=index.d.ts.map