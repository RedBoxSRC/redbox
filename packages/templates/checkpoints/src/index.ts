import { GenesisData, StateMachine, Transaction, verifyMessage } from "@redbox/core";

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

function ensureSigned(tx: Transaction): asserts tx is Transaction & { senderPubKey: string; signature: string } {
  if (!tx.senderPubKey || !tx.signature) {
    throw new Error("Checkpoint tx must be signed");
  }
}

export const CheckpointStateMachine: StateMachine<CheckpointState> = {
  name: "checkpoints",
  initState(genesis: GenesisData): CheckpointState {
    const app = (genesis.appState as Partial<CheckpointState>) ?? {};
    return {
      checkpoints: app.checkpoints ?? {},
      aggregators: app.aggregators ?? []
    };
  },
  async validateTx(state: CheckpointState, tx: Transaction) {
    if (tx.type !== "submit-checkpoint") {
      throw new Error("Unsupported tx type for checkpoints");
    }
    ensureSigned(tx);
    const ok = await verifyMessage(tx.id, tx.signature, tx.senderPubKey);
    if (!ok) throw new Error("Invalid signature");
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
  applyTx(state: CheckpointState, tx: Transaction): CheckpointState {
    const chainId = tx.payload.chainId;
    const checkpoints = { ...state.checkpoints };
    const nextForChain = checkpoints[chainId] ? [...checkpoints[chainId]] : [];
    nextForChain.push({
      chainId,
      height: Number(tx.payload.height),
      root: tx.payload.root,
      submittedBy: tx.senderPubKey!,
      metadata: tx.payload.metadata ?? {}
    });
    checkpoints[chainId] = nextForChain;
    return { checkpoints, aggregators: state.aggregators };
  }
};

export default CheckpointStateMachine;
