# RedBox Core v0.8.0-beta — Mini Blockchain Framework

Redbox is an open-source TypeScript framework for spinning up application-specific blockchains by swapping a single state machine module. It bundles a lean node runtime, solo/PoA consensus, LevelDB storage, REST+WS APIs, CLI tooling, pluggable templates, and a tiny explorer—everything runnable locally with Node 20+ and pnpm.

> License & attribution: Redbox is an open-source project licensed under Redbox copyright. Anyone using or redistributing this project must credit Redbox clearly in their documentation and user-facing materials.

## Features
- Deterministic state machine interface (`initState`, `validateTx`, `applyTx`).
- Consensus modules: `solo` (single proposer) and `poa` (static validator set, round-robin).
- P2P gossip + catch-up sync over WebSocket.
- LevelDB-backed block/state storage (snapshot each height).
- REST API + WebSocket events.
- CLI for init/start/dev, key/genesis tooling, tx signer, explorer launcher.
- Templates: `counter`, `messages`, `ledger` (simple balances with signed transfers).
- Minimal Vite + React explorer for status, blocks, state, and tx submission.
- TypeScript everywhere; Node.js 20+; pnpm workspaces.

## Repo Layout
```
redbox/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  packages/
    core/              # node runtime, types, hashing, crypto helpers
    p2p/               # websocket gossip + sync
    storage-level/     # LevelDB BlockStore
    consensus-solo/    # single leader
    consensus-poa/     # round-robin PoA
    cli/               # redbox CLI
    templates/         # counter/messages/ledger state machines
  apps/
    explorer/          # Vite + React explorer UI
  docs/
    ARCHITECTURE.md    # component overview
  REDBOX_BETA.md       # full usage guide
```

## Prerequisites
- Node.js >= 20
- pnpm >= 8

## Install & Build
```bash
pnpm install
pnpm build
```

Workspace scripts:
- `pnpm dev` — single-node dev chain + explorer (counter template).
- `pnpm --filter ./packages/cli exec redbox ...` — run CLI commands after build.
- `pnpm --filter explorer dev` — run explorer only.

## Quick Start (Single Node)
Runs the counter template; API on `26657`, P2P on `26656`, explorer on `5173`.
```bash
pnpm dev
# API: http://localhost:26657
# Explorer: http://localhost:5173
```

Submit a counter tx:
```bash
curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  -d '{"type":"inc","payload":{"amount":1}}'
```

## Templates
- **counter**: numeric `value`, tx `{type:"inc", payload:{amount:number}}`.
- **messages**: append-only log, tx `{type:"message", payload:{message:string}}`.
- **ledger**: simple balances with signed transfers, tx `{type:"transfer", payload:{to:string, amount:number}, senderPubKey, signature}`.

Switch templates in your config (`stateMachine: "counter" | "messages" | "ledger"`) or scaffold a new project with `redbox init <name> --template <counter|messages|ledger>`. Custom state machines can be used by pointing `stateMachine` to a local module path that exports `initState`, `validateTx`, and `applyTx`.

## CLI Reference
- `redbox init <name> --template <counter|messages|ledger>` — scaffold a chain folder (uses templates above).
- `redbox dev` — single node + explorer (counter).
- `redbox start --config <file>` — start a node from config (solo or PoA).
- `redbox keys gen --out <dir>` — generate ed25519 keys.
- `redbox genesis create --chainId <id> --validators <pub...> --out <file>` — author a genesis.
- `redbox tx sign --type ... --payload ... --sender ... --priv ...` — build signed tx JSON (for ledger transfers).
- `redbox explorer` — run explorer only.

## Config Schema (JSON/YAML)
```json
{
  "chainId": "redbox-demo",
  "stateMachine": "counter",               // or path to custom module
  "genesis": "./genesis.json",
  "key": "./keys/validator.json",
  "consensus": { "type": "solo", "validators": [{ "name": "val1", "pubKey": "<hex>" }] },
  "api": { "port": 26657 },
  "p2p": { "port": 26656, "seeds": [] },
  "storage": "./data",
  "blockTimeMs": 2000
}
```

Start from config:
```bash
pnpm --filter cli exec redbox start --config ./mychain/config.json
```

## Three-Node PoA (Local)
Pre-generated validator keys (replace as needed):
- nodeA pub: `553d34975ad12d96747c7a8cf10fb50c4ebef0f36a6603211bc5e832bc760e05`
- nodeB pub: `89ab85c5bf0d2a31018f794c65863de8ca198edeb4b824a4af0add040857fea3`
- nodeC pub: `0de0422a8db1e1306d816e336da7b10b4e999b8cfed351508b67cdc310c336dd`

Genesis (`local-poa/genesis.json`):
```json
{
  "chainId": "redbox-poa",
  "validators": [
    { "name": "nodeA", "pubKey": "553d34975ad12d96747c7a8cf10fb50c4ebef0f36a6603211bc5e832bc760e05" },
    { "name": "nodeB", "pubKey": "89ab85c5bf0d2a31018f794c65863de8ca198edeb4b824a4af0add040857fea3" },
    { "name": "nodeC", "pubKey": "0de0422a8db1e1306d816e336da7b10b4e999b8cfed351508b67cdc310c336dd" }
  ],
  "appState": { "value": 0 }
}
```

Configs (ports/seeds adjusted per node):
- nodeA `api.port`: 26657, `p2p.port`: 26656, `seeds`: `["ws://localhost:36656", "ws://localhost:46656"]`
- nodeB `api.port`: 36657, `p2p.port`: 36656, `seeds`: `["ws://localhost:26656", "ws://localhost:46656"]`
- nodeC `api.port`: 46657, `p2p.port`: 46656, `seeds`: `["ws://localhost:26656", "ws://localhost:36656"]`

Start (separate terminals):
```bash
pnpm --filter cli exec redbox start --config local-poa/nodeA/config.json
pnpm --filter cli exec redbox start --config local-poa/nodeB/config.json
pnpm --filter cli exec redbox start --config local-poa/nodeC/config.json
```

## APIs
- `GET /status` — chainId, height, mempool, consensus, validators.
- `GET /state` — latest state snapshot.
- `GET /block/latest` / `/block/:height`
- `POST /tx` — submit transaction (`type`, `payload`, optional `senderPubKey` + `signature`).
- WS `/ws` — events `status`, `newBlock`, `newTx`.

Examples:
```bash
# counter increment
curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  -d '{"type":"inc","payload":{"amount":2}}'

# message append
curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  -d '{"type":"message","payload":{"message":"gm from redbox"}}'

# ledger transfer (signed)
pnpm --filter cli exec redbox tx sign \
  --type transfer \
  --payload '{"to":"<recipient-pub>","amount":5}' \
  --sender <sender-pub> \
  --priv <sender-priv> > tx.json
curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  --data @tx.json
```

## Explorer
Run separately (uses API/WS):
```bash
pnpm --filter explorer dev -- --host 0.0.0.0 --port 5173
```
Shows status, recent blocks, block detail, state view, and a tx form.

## Custom State Machines
Implement `StateMachine` (`initState`, `validateTx`, `applyTx`) in a JS/TS file:
```ts
import { StateMachine, GenesisData, Transaction } from "@redbox/core";

const MyModule: StateMachine<{ items: string[] }> = {
  name: "my-module",
  initState(_g: GenesisData) { return { items: [] }; },
  validateTx(_s, tx: Transaction) {
    if (tx.type !== "add-item") throw new Error("bad type");
    if (typeof tx.payload?.item !== "string") throw new Error("missing item");
  },
  applyTx(state, tx) { return { items: [...state.items, tx.payload.item] }; }
};

export default MyModule;
```
Point config at the file (`"stateMachine": "../chains/my-module.js"`) and start with `redbox start --config ...`. Keep `validateTx`/`applyTx` pure and deterministic (no time/rand).

## Determinism & Security Notes
- Hashing: canonical JSON + SHA-256.
- Signatures: ed25519; blocks must be signed by the proposer; ledger transfers must be signed by sender.
- Storage: block + state snapshot each height in LevelDB.
- P2P: WebSocket gossip with basic height-based catch-up.
- Scope: Beta, optimized for local/dev PoA/solo use (no smart-contract VM or complex crypto-economics).

## Contributing & Attribution
- Contributions welcome via issues/PRs.
- Any fork or redistribution must credit Redbox visibly in docs and user experiences per the project’s copyright notice.
