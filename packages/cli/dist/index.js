#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const child_process_1 = require("child_process");
const yaml_1 = __importDefault(require("yaml"));
const core_1 = require("@redbox/core");
const storage_level_1 = require("@redbox/storage-level");
const consensus_solo_1 = require("@redbox/consensus-solo");
const consensus_poa_1 = require("@redbox/consensus-poa");
const p2p_1 = require("@redbox/p2p");
const templates_counter_1 = __importDefault(require("@redbox/templates-counter"));
const templates_messages_1 = __importDefault(require("@redbox/templates-messages"));
const templates_ledger_1 = __importDefault(require("@redbox/templates-ledger"));
const templates_interop_1 = __importDefault(require("@redbox/templates-interop"));
const templates_checkpoints_1 = __importDefault(require("@redbox/templates-checkpoints"));
const program = new commander_1.Command();
program.name("redbox").description("redbox mini blockchain framework");
const templateRegistry = {
    counter: templates_counter_1.default,
    messages: templates_messages_1.default,
    ledger: templates_ledger_1.default,
    interop: templates_interop_1.default,
    checkpoints: templates_checkpoints_1.default
};
function defaultAppState(template, validatorPubKey) {
    switch (template) {
        case "ledger":
            return { balances: { [validatorPubKey]: 1000 } };
        case "interop":
            return { chains: {}, outbox: [], inbox: [], nextMessageId: 0, admins: [validatorPubKey] };
        case "checkpoints":
            return { checkpoints: {}, aggregators: [validatorPubKey] };
        default:
            return {};
    }
}
function readJSONMaybeYAML(file) {
    const raw = fs_1.default.readFileSync(file, "utf-8");
    if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        return yaml_1.default.parse(raw);
    }
    return JSON.parse(raw);
}
async function loadStateMachine(ref, baseDir) {
    const lower = ref.toLowerCase();
    if (templateRegistry[lower])
        return templateRegistry[lower];
    const mod = await Promise.resolve(`${path_1.default.isAbsolute(ref) ? ref : path_1.default.join(baseDir, ref)}`).then(s => __importStar(require(s)));
    const candidate = mod.default ?? mod;
    if (!candidate)
        throw new Error(`State machine not found at ${ref}`);
    return candidate;
}
async function readKey(file) {
    const key = readJSONMaybeYAML(file);
    if (!key.privKey || !key.pubKey)
        throw new Error("Invalid key file");
    return key;
}
async function startNodeFromConfig(configPath) {
    const abs = path_1.default.resolve(configPath);
    const cfg = readJSONMaybeYAML(abs);
    const baseDir = path_1.default.dirname(abs);
    const genesisPath = path_1.default.resolve(baseDir, cfg.genesis);
    const genesis = readJSONMaybeYAML(genesisPath);
    const key = await readKey(path_1.default.resolve(baseDir, cfg.key));
    const stateMachine = await loadStateMachine(cfg.stateMachine, baseDir);
    const dataDir = path_1.default.resolve(baseDir, cfg.storage ?? "./data");
    await fs_extra_1.default.ensureDir(dataDir);
    const storage = new storage_level_1.LevelBlockStore(dataDir);
    let consensus;
    if (cfg.consensus.type === "solo") {
        consensus = new consensus_solo_1.SoloConsensus({ validator: cfg.consensus.validators[0] });
    }
    else {
        consensus = new consensus_poa_1.PoAConsensus({ validators: cfg.consensus.validators });
    }
    let node;
    const p2pAdapter = cfg.p2p
        ? new p2p_1.P2PNode({
            port: cfg.p2p.port,
            seeds: cfg.p2p.seeds,
            chainId: cfg.chainId,
            getLatestHeight: () => node?.getHeight() ?? 0,
            getBlock: (h) => node?.getBlock(h) ?? Promise.resolve(undefined)
        })
        : undefined;
    node = new core_1.RedboxNode({
        chainId: cfg.chainId,
        genesis,
        consensus,
        stateMachine,
        key,
        blockTimeMs: cfg.blockTimeMs,
        api: cfg.api,
        p2p: cfg.p2p,
        storage,
        p2pAdapter
    });
    await node.start();
    return node;
}
program
    .command("start")
    .description("Start a node from config file")
    .requiredOption("-c, --config <path>", "config file path")
    .action(async (opts) => {
    const node = await startNodeFromConfig(opts.config);
    console.log(`Node running for chain ${node.getStatus().chainId}, height ${node.getHeight()}`);
    process.on("SIGINT", async () => {
        await node.stop();
        process.exit(0);
    });
});
program
    .command("dev")
    .description("Run a local single-node devnet and explorer")
    .action(async () => {
    const base = path_1.default.join(process.cwd(), ".redbox", "dev");
    await fs_extra_1.default.ensureDir(base);
    const keyPath = path_1.default.join(base, "node-key.json");
    if (!fs_1.default.existsSync(keyPath)) {
        const key = await (0, core_1.generateKeyPair)();
        await fs_extra_1.default.writeJSON(keyPath, key, { spaces: 2 });
    }
    const key = readJSONMaybeYAML(keyPath);
    const genesisPath = path_1.default.join(base, "genesis.json");
    const genesis = {
        chainId: "redbox-dev",
        validators: [{ name: "dev-node", pubKey: key.pubKey }],
        appState: { value: 0 }
    };
    await fs_extra_1.default.writeJSON(genesisPath, genesis, { spaces: 2 });
    const config = {
        chainId: "redbox-dev",
        stateMachine: "counter",
        genesis: genesisPath,
        key: keyPath,
        consensus: { type: "solo", validators: [{ name: "dev-node", pubKey: key.pubKey }] },
        api: { port: 26657 },
        p2p: { port: 26656, seeds: [] },
        storage: path_1.default.join(base, "data")
    };
    const node = await startNodeFromConfig(writeTempConfig(base, config));
    console.log("Dev node running on http://localhost:26657");
    const explorer = (0, child_process_1.spawn)("pnpm", ["--filter", "explorer", "dev", "--", "--host", "0.0.0.0"], {
        stdio: "inherit",
        cwd: path_1.default.join(process.cwd())
    });
    explorer.on("exit", async () => {
        await node.stop();
        process.exit(0);
    });
    process.on("SIGINT", async () => {
        explorer.kill("SIGINT");
        await node.stop();
        process.exit(0);
    });
});
function writeTempConfig(base, cfg) {
    const tmp = path_1.default.join(base, "config.auto.json");
    fs_1.default.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    return tmp;
}
program
    .command("init")
    .description("Initialize a new chain folder")
    .argument("<name>")
    .requiredOption("-t, --template <template>", "counter|messages|ledger|interop|checkpoints", "counter")
    .action(async (name, opts) => {
    const dir = path_1.default.resolve(process.cwd(), name);
    await fs_extra_1.default.ensureDir(dir);
    const keysDir = path_1.default.join(dir, "keys");
    await fs_extra_1.default.ensureDir(keysDir);
    const key = await (0, core_1.generateKeyPair)();
    const keyPath = path_1.default.join(keysDir, "validator.json");
    await fs_extra_1.default.writeJSON(keyPath, key, { spaces: 2 });
    const chainId = `redbox-${name}`;
    const genesis = {
        chainId,
        validators: [{ name: "validator", pubKey: key.pubKey }],
        appState: defaultAppState(opts.template, key.pubKey)
    };
    const genesisPath = path_1.default.join(dir, "genesis.json");
    await fs_extra_1.default.writeJSON(genesisPath, genesis, { spaces: 2 });
    const config = {
        chainId,
        stateMachine: opts.template,
        genesis: "./genesis.json",
        key: "./keys/validator.json",
        consensus: { type: "solo", validators: [{ name: "validator", pubKey: key.pubKey }] },
        api: { port: 26657 },
        p2p: { port: 26656, seeds: [] },
        storage: "./data"
    };
    const configPath = path_1.default.join(dir, "config.json");
    await fs_extra_1.default.writeJSON(configPath, config, { spaces: 2 });
    console.log(`Chain ${name} created at ${dir}`);
});
const keysCmd = program.command("keys").description("Key management");
keysCmd
    .command("gen")
    .description("Generate an ed25519 keypair")
    .requiredOption("--out <dir>", "output directory")
    .action(async (opts) => {
    const kp = await (0, core_1.generateKeyPair)();
    await fs_extra_1.default.ensureDir(opts.out);
    const outPath = path_1.default.join(opts.out, "key.json");
    await fs_extra_1.default.writeJSON(outPath, kp, { spaces: 2 });
    console.log(`Key written to ${outPath}`);
});
const genesisCmd = program.command("genesis").description("Genesis utilities");
genesisCmd
    .command("create")
    .description("Create a genesis file")
    .requiredOption("--chainId <id>", "chain id")
    .requiredOption("--validators <list...>", "validator pub keys")
    .option("--app <path>", "app state json/yaml file")
    .requiredOption("--out <file>", "output file")
    .action(async (opts) => {
    const appState = opts.app ? readJSONMaybeYAML(path_1.default.resolve(opts.app)) : {};
    const genesis = {
        chainId: opts.chainId,
        validators: opts.validators.map((pub, idx) => ({
            name: `val${idx + 1}`,
            pubKey: pub
        })),
        appState
    };
    await fs_extra_1.default.writeJSON(path_1.default.resolve(opts.out), genesis, { spaces: 2 });
    console.log(`Genesis written to ${opts.out}`);
});
const txCmd = program.command("tx").description("Tx utilities");
txCmd
    .command("sign")
    .description("Create and sign a tx payload")
    .requiredOption("--type <type>", "tx type")
    .requiredOption("--payload <json>", "payload json")
    .requiredOption("--sender <pubKey>", "sender public key")
    .requiredOption("--priv <privKey>", "sender private key")
    .option("--out <file>", "write tx to file")
    .action(async (opts) => {
    const payload = JSON.parse(opts.payload);
    const txBase = { type: opts.type, payload, senderPubKey: opts.sender };
    const id = (0, core_1.calculateTxId)(txBase);
    const signature = await (0, core_1.signMessage)(id, opts.priv);
    const tx = { ...txBase, id, signature };
    if (opts.out) {
        await fs_extra_1.default.writeJSON(path_1.default.resolve(opts.out), tx, { spaces: 2 });
        console.log(`Tx written to ${opts.out}`);
    }
    else {
        console.log(JSON.stringify(tx, null, 2));
    }
});
program
    .command("explorer")
    .description("Run the explorer UI")
    .option("--host <host>", "host", "0.0.0.0")
    .option("--port <port>", "port", "5173")
    .action((opts) => {
    const child = (0, child_process_1.spawn)("pnpm", ["--filter", "explorer", "dev", "--", "--host", opts.host, "--port", opts.port], { stdio: "inherit", cwd: path_1.default.join(process.cwd()) });
    child.on("exit", (code) => process.exit(code ?? 0));
});
program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
