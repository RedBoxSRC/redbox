# RedBox Core v0.8.0-beta — Beta Guide

A minimal, modular blockchain framework for spinning up app-specific chains with a pluggable state machine. Everything is TypeScript, runs on Node 20+, and ships with solo/PoA consensus, LevelDB storage, REST+WS APIs, CLI tooling, and a tiny explorer.

## Prerequisites
- Node.js 20+
- pnpm 8+

## Install & Build
```bash
pnpm install
pnpm build
```

Workspace scripts:
- `pnpm dev` — single-node dev chain + explorer (counter module).
- `pnpm --filter cli exec redbox ...` — run CLI commands after build.
- `pnpm --filter explorer dev` — run explorer only.

## Repo Layout
```
packages/
  core/                # node runtime, types, hashing, crypto helpers
  p2p/                 # websocket gossip + sync
  storage-level/       # LevelDB BlockStore
  consensus-solo/      # single leader
  consensus-poa/       # round-robin PoA
  cli/                 # redbox CLI
  templates/           # counter/messages/ledger state machines
apps/explorer/         # Vite + React explorer
docs/ARCHITECTURE.md   # overview
REDBOX_BETA.md         # this guide
```

## Quick Start: Single Node Dev
Runs the counter template, API on `26657`, P2P on `26656`, explorer on `5173`.
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

## Start From Config
1) Build once: `pnpm build`  
2) Create a chain folder (or `pnpm --filter cli exec redbox init mychain --template counter`).  
3) Start:
```bash
pnpm --filter cli exec redbox start --config ./mychain/config.json
```

### Config schema (JSON/YAML)
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

## Local 3-Node PoA Example
Pre-generated validator keys (use as-is or replace with `redbox keys gen`):
- nodeA: `privKey` `e268632e0fb7bce41c48e29867a8dbd7565d512e69dd3fbe2d9d1d670c23635d`, `pubKey` `553d34975ad12d96747c7a8cf10fb50c4ebef0f36a6603211bc5e832bc760e05`
- nodeB: `privKey` `fdde08945066925f61f9e9d3637fb3fe5f820507209bd6ba6def879fabad4e34`, `pubKey` `89ab85c5bf0d2a31018f794c65863de8ca198edeb4b824a4af0add040857fea3`
- nodeC: `privKey` `82413d5ecb58e4038d92b7d7bfbad8ac44c60aef6320fa8bfbe4325daa993f67`, `pubKey` `0de0422a8db1e1306d816e336da7b10b4e999b8cfed351508b67cdc310c336dd`

### 1) Genesis (save as `local-poa/genesis.json`)
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

### 2) Key files
- `local-poa/nodeA/key.json` with nodeA keys above.
- `local-poa/nodeB/key.json` with nodeB keys.
- `local-poa/nodeC/key.json` with nodeC keys.

### 3) Configs
`local-poa/nodeA/config.json`
```json
{
  "chainId": "redbox-poa",
  "stateMachine": "counter",
  "genesis": "../genesis.json",
  "key": "./key.json",
  "consensus": {
    "type": "poa",
    "validators": [
      { "name": "nodeA", "pubKey": "553d34975ad12d96747c7a8cf10fb50c4ebef0f36a6603211bc5e832bc760e05" },
      { "name": "nodeB", "pubKey": "89ab85c5bf0d2a31018f794c65863de8ca198edeb4b824a4af0add040857fea3" },
      { "name": "nodeC", "pubKey": "0de0422a8db1e1306d816e336da7b10b4e999b8cfed351508b67cdc310c336dd" }
    ]
  },
  "api": { "port": 26657 },
  "p2p": { "port": 26656, "seeds": ["ws://localhost:36656", "ws://localhost:46656"] },
  "storage": "./data"
}
```

`local-poa/nodeB/config.json`
```json
{
  "chainId": "redbox-poa",
  "stateMachine": "counter",
  "genesis": "../genesis.json",
  "key": "./key.json",
  "consensus": {
    "type": "poa",
    "validators": [
      { "name": "nodeA", "pubKey": "553d34975ad12d96747c7a8cf10fb50c4ebef0f36a6603211bc5e832bc760e05" },
      { "name": "nodeB", "pubKey": "89ab85c5bf0d2a31018f794c65863de8ca198edeb4b824a4af0add040857fea3" },
      { "name": "nodeC", "pubKey": "0de0422a8db1e1306d816e336da7b10b4e999b8cfed351508b67cdc310c336dd" }
    ]
  },
  "api": { "port": 36657 },
  "p2p": { "port": 36656, "seeds": ["ws://localhost:26656", "ws://localhost:46656"] },
  "storage": "./data"
}
```

`local-poa/nodeC/config.json`
```json
{
  "chainId": "redbox-poa",
  "stateMachine": "counter",
  "genesis": "../genesis.json",
  "key": "./key.json",
  "consensus": {
    "type": "poa",
    "validators": [
      { "name": "nodeA", "pubKey": "553d34975ad12d96747c7a8cf10fb50c4ebef0f36a6603211bc5e832bc760e05" },
      { "name": "nodeB", "pubKey": "89ab85c5bf0d2a31018f794c65863de8ca198edeb4b824a4af0add040857fea3" },
      { "name": "nodeC", "pubKey": "0de0422a8db1e1306d816e336da7b10b4e999b8cfed351508b67cdc310c336dd" }
    ]
  },
  "api": { "port": 46657 },
  "p2p": { "port": 46656, "seeds": ["ws://localhost:26656", "ws://localhost:36656"] },
  "storage": "./data"
}
```

### 4) Start nodes (separate terminals)
```bash
pnpm --filter cli exec redbox start --config local-poa/nodeA/config.json
pnpm --filter cli exec redbox start --config local-poa/nodeB/config.json
pnpm --filter cli exec redbox start --config local-poa/nodeC/config.json
```

## APIs (REST + WS)
- `GET /status` — chainId, height, mempool, consensus, validators.
- `GET /state` — latest state snapshot.
- `GET /block/latest` / `/block/:height`
- `POST /tx` — submit transaction (`type`, `payload`, optional `senderPubKey` + `signature`).
- WS `/ws` — events `status`, `newBlock`, `newTx`.

### curl examples
Counter increment:
```bash
curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  -d '{"type":"inc","payload":{"amount":2}}'
```

Messages append:
```bash
curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  -d '{"type":"message","payload":{"message":"gm from redbox"}}'
```

Ledger transfer (requires signature):
```bash
# create & sign tx (returns JSON with id/signature)
pnpm --filter cli exec redbox tx sign \
  --type transfer \
  --payload '{"to":"<recipient-pub>","amount":5}' \
  --sender <sender-pub> \
  --priv <sender-priv> > tx.json

curl -X POST http://localhost:26657/tx \
  -H "Content-Type: application/json" \
  --data @tx.json
```

## Create a Custom State Machine
1. Create a module file (e.g. `./chains/my-module.js`):
```ts
import { StateMachine, Transaction, GenesisData } from "@redbox/core";

const MyModule: StateMachine<{ items: string[] }> = {
  name: "my-module",
  initState(_genesis: GenesisData) { return { items: [] }; },
  validateTx(_state, tx: Transaction) {
    if (tx.type !== "add-item") throw new Error("bad type");
    if (typeof tx.payload?.item !== "string") throw new Error("missing item");
  },
  applyTx(state, tx) { return { items: [...state.items, tx.payload.item] }; }
};

export default MyModule;
```
2. Point your config at the file: `"stateMachine": "../chains/my-module.js"`.
3. Start via `redbox start --config ...`. The module must be deterministic (no time/rand), and `validateTx/applyTx` must be pure.

## CLI Reference
- `redbox init <name> --template <counter|messages|ledger>` — scaffold a chain folder.
- `redbox dev` — single node + explorer (counter).
- `redbox start --config <file>` — start a node from config.
- `redbox keys gen --out <dir>` — generate ed25519 keys.
- `redbox genesis create --chainId <id> --validators <pub...> --out <file>` — author a genesis.
- `redbox explorer` — run explorer only.
- `redbox tx sign --type ... --payload ... --sender ... --priv ...` — build signed tx JSON.

## Notes & Guarantees
- Deterministic hashing via canonical JSON + SHA-256.
- Signatures: ed25519; block signatures required; ledger transfers require tx signature.
- Storage: block + state snapshot each height in LevelDB.
- P2P: WebSocket gossip with start-up catch-up (requests missing heights).
- This is beta: keep to local/dev use; no complex crypto-economics or smart contract VM.
