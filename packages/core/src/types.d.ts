export interface Transaction {
    id: string;
    type: string;
    payload: any;
    senderPubKey?: string;
    signature?: string;
}
export interface Block {
    height: number;
    timestamp: number;
    prevHash: string | null;
    txs: Transaction[];
    proposerPubKey: string;
    signature: string;
    blockHash: string;
}
export interface Validator {
    name: string;
    pubKey: string;
}
export interface GenesisData {
    chainId: string;
    validators: Validator[];
    appState?: any;
}
export interface StateMachine<State = any> {
    name: string;
    initState(genesis: GenesisData): State;
    validateTx(state: State, tx: Transaction): Promise<void> | void;
    applyTx(state: State, tx: Transaction): State;
}
export interface BlockStore {
    init(): Promise<void>;
    getLatestHeight(): Promise<number>;
    getBlock(height: number): Promise<Block | undefined>;
    putBlock(block: Block, stateSnapshot: any): Promise<void>;
    getState(height: number): Promise<any | undefined>;
    getLatestState(): Promise<{
        height: number;
        state: any;
    } | undefined>;
}
export interface ConsensusModule {
    type: string;
    getProposer(height: number): Validator;
    isProposer(pubKey: string, height: number): boolean;
    validators(): Validator[];
}
export interface NodeKey {
    pubKey: string;
    privKey: string;
}
export interface P2PConfig {
    port: number;
    seeds?: string[];
}
export interface ApiConfig {
    port: number;
    host?: string;
}
export interface NodeConfig {
    chainId: string;
    genesis: GenesisData;
    consensus: ConsensusModule;
    stateMachine: StateMachine;
    key: NodeKey;
    blockTimeMs?: number;
    p2p?: P2PConfig;
    api?: ApiConfig;
    storage: BlockStore;
    p2pAdapter?: P2PAdapter;
}
export interface NewBlockEvent {
    block: Block;
    state: any;
}
export interface P2PAdapter {
    start(): Promise<void>;
    stop(): Promise<void>;
    broadcastTx(tx: Transaction): void;
    broadcastBlock(block: Block): void;
    on(event: "tx" | "block" | "status", handler: (data: any) => void): this;
}
//# sourceMappingURL=types.d.ts.map