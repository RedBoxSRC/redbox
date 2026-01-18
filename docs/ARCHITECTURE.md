# RedBox Core v0.8.4 Architecture

## Components
- **Core (@redbox/core)**: defines types, hashing, key utilities, mempool, and the `RedboxNode` runtime that wires the state machine, consensus, storage, HTTP/WS API, and optional P2P adapter.
- **Consensus modules**: `@redbox/consensus-solo` (single proposer) and `@redbox/consensus-poa` (static validator set, round-robin proposer). They both satisfy the `ConsensusModule` interface exported by core.
- **Storage (@redbox/storage-level)**: LevelDB-backed `BlockStore` that keeps blocks, snapshots, and latest height under simple keys.
- **P2P (@redbox/p2p)**: WebSocket gossip for txs/blocks plus basic catch-up (requests missing heights on connect), seed reconnection, and chain-id tagged messages to avoid cross-network bleed-through.
- **State machines (templates)**: Pluggable modules implementing `StateMachine` (`initState`, `validateTx`, `applyTx`). Templates shipped: `counter`, `messages`, `ledger`, `interop` (message bus/remote chain registry), `checkpoints` (anchoring remote roots).
- **CLI (redbox)**: Entry point for node lifecycle, key and genesis helpers, chain scaffolding, and explorer launcher.
- **Explorer (apps/explorer)**: Vite + React UI that shows status, blocks, state, and a tx submitter over the node API/WS.

## Data flow
1. **Mempool** collects validated txs submitted via API or P2P.
2. **Consensus** decides the proposer for the next height; if the local key is proposer and mempool has txs, the node builds a block.
3. **Block creation**: sequentially validates/applies txs with the active state machine, signs the block hash with ed25519, stores block + state snapshot.
4. **API/WS** surfaces status, blocks, state, export endpoints (`/export/snapshot`, `/export/blocks`), and broadcasts `status`/`newBlock`/`newTx` events to explorer and clients.
5. **P2P gossip** spreads txs/blocks. On connect peers exchange height; the lower node asks for missing blocks and replays them through the same validation path. Seed peers auto-reconnect and all gossip messages carry the `chainId`.

## Key interfaces
- **StateMachine**: `name`, `initState(genesis)`, `validateTx(state, tx)`, `applyTx(state, tx) -> newState`. Must be deterministic and pure.
- **ConsensusModule**: `type`, `getProposer(height)`, `isProposer(pubKey, height)`, `validators()`.
- **BlockStore**: `init`, `getLatestHeight`, `getBlock(height)`, `putBlock(block, state)`, `getState(height)`, `getLatestState`.
- **P2PAdapter**: `start`, `stop`, `broadcastTx`, `broadcastBlock`, emits `tx`/`block` events.

## Block & transaction hashing
- Canonical JSON (stable key order) is hashed with SHA-256.
- `tx.id` hashes `{type, payload, senderPubKey}` (no signature/id).
- `block.blockHash` hashes `{height, timestamp, prevHash, txs, proposerPubKey}`; signatures are over `blockHash`.

## Storage layout (LevelDB)
- `height` -> latest height.
- `block:<height>` -> serialized block.
- `state:<height>` -> serialized state snapshot.

## Networking
- HTTP: `/status`, `/state`, `/state/:height`, `/block/latest`, `/block/:height`, `/export/snapshot`, `/export/blocks`, `POST /tx`.
- WS: `/ws` emits `status`, `newBlock`, `newTx` (status rebroadcasts on each committed block).
- P2P WS messages: `status`, `tx`, `block`, `getBlocks`, `blocks` (all tagged with `chainId`; seeds reconnect on a timer).
