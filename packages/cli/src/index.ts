#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import fs from "fs";
import fsExtra from "fs-extra";
import { spawn } from "child_process";
import YAML from "yaml";
import {
  GenesisData,
  NodeKey,
  RedboxNode,
  StateMachine,
  calculateTxId,
  generateKeyPair,
  signMessage
} from "@redbox/core";
import { LevelBlockStore } from "@redbox/storage-level";
import { SoloConsensus } from "@redbox/consensus-solo";
import { PoAConsensus } from "@redbox/consensus-poa";
import { P2PNode } from "@redbox/p2p";
import CounterStateMachine from "@redbox/templates-counter";
import MessagesStateMachine from "@redbox/templates-messages";
import LedgerStateMachine from "@redbox/templates-ledger";
import IntegrationStateMachine from "@redbox/templates-interop";
import CheckpointStateMachine from "@redbox/templates-checkpoints";

const program = new Command();
program.name("redbox").description("redbox mini blockchain framework");

type FileConsensus =
  | { type: "solo"; validators: { name: string; pubKey: string }[] }
  | { type: "poa"; validators: { name: string; pubKey: string }[] };

interface ConfigFile {
  chainId: string;
  stateMachine: string;
  genesis: string;
  key: string;
  consensus: FileConsensus;
  api?: { port: number };
  p2p?: { port: number; seeds?: string[] };
  blockTimeMs?: number;
  storage?: string;
}

const templateRegistry: Record<string, StateMachine> = {
  counter: CounterStateMachine,
  messages: MessagesStateMachine,
  ledger: LedgerStateMachine,
  interop: IntegrationStateMachine,
  checkpoints: CheckpointStateMachine
};
type TemplateName = keyof typeof templateRegistry;

function defaultAppState(template: TemplateName, validatorPubKey: string): any {
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

function readJSONMaybeYAML(file: string): any {
  const raw = fs.readFileSync(file, "utf-8");
  if (file.endsWith(".yaml") || file.endsWith(".yml")) {
    return YAML.parse(raw);
  }
  return JSON.parse(raw);
}

async function loadStateMachine(ref: string, baseDir: string): Promise<StateMachine> {
  const lower = ref.toLowerCase();
  if (templateRegistry[lower]) return templateRegistry[lower];
  const mod = await import(path.isAbsolute(ref) ? ref : path.join(baseDir, ref));
  const candidate = (mod as any).default ?? mod;
  if (!candidate) throw new Error(`State machine not found at ${ref}`);
  return candidate as StateMachine;
}

async function readKey(file: string): Promise<NodeKey> {
  const key = readJSONMaybeYAML(file);
  if (!key.privKey || !key.pubKey) throw new Error("Invalid key file");
  return key;
}

async function startNodeFromConfig(configPath: string): Promise<RedboxNode> {
  const abs = path.resolve(configPath);
  const cfg = readJSONMaybeYAML(abs) as ConfigFile;
  const baseDir = path.dirname(abs);
  const genesisPath = path.resolve(baseDir, cfg.genesis);
  const genesis = readJSONMaybeYAML(genesisPath) as GenesisData;
  const key = await readKey(path.resolve(baseDir, cfg.key));
  const stateMachine = await loadStateMachine(cfg.stateMachine, baseDir);
  const dataDir = path.resolve(baseDir, cfg.storage ?? "./data");
  await fsExtra.ensureDir(dataDir);
  const storage = new LevelBlockStore(dataDir);
  let consensus;
  if (cfg.consensus.type === "solo") {
    consensus = new SoloConsensus({ validator: cfg.consensus.validators[0] });
  } else {
    consensus = new PoAConsensus({ validators: cfg.consensus.validators });
  }

  let node: RedboxNode;
  const p2pAdapter = cfg.p2p
    ? new P2PNode({
        port: cfg.p2p.port,
        seeds: cfg.p2p.seeds,
        chainId: cfg.chainId,
        getLatestHeight: () => node?.getHeight() ?? 0,
        getBlock: (h) => node?.getBlock(h) ?? Promise.resolve(undefined)
      })
    : undefined;

  node = new RedboxNode({
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
    const base = path.join(process.cwd(), ".redbox", "dev");
    await fsExtra.ensureDir(base);
    const keyPath = path.join(base, "node-key.json");
    if (!fs.existsSync(keyPath)) {
      const key = await generateKeyPair();
      await fsExtra.writeJSON(keyPath, key, { spaces: 2 });
    }
    const key = readJSONMaybeYAML(keyPath);
    const genesisPath = path.join(base, "genesis.json");
    const genesis: GenesisData = {
      chainId: "redbox-dev",
      validators: [{ name: "dev-node", pubKey: key.pubKey }],
      appState: { value: 0 }
    };
    await fsExtra.writeJSON(genesisPath, genesis, { spaces: 2 });
    const config: ConfigFile = {
      chainId: "redbox-dev",
      stateMachine: "counter",
      genesis: genesisPath,
      key: keyPath,
      consensus: { type: "solo", validators: [{ name: "dev-node", pubKey: key.pubKey }] },
      api: { port: 26657 },
      p2p: { port: 26656, seeds: [] },
      storage: path.join(base, "data")
    };
    const node = await startNodeFromConfig(writeTempConfig(base, config));
    console.log("Dev node running on http://localhost:26657");
    const explorer = spawn("pnpm", ["--filter", "explorer", "dev", "--", "--host", "0.0.0.0"], {
      stdio: "inherit",
      cwd: path.join(process.cwd())
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

function writeTempConfig(base: string, cfg: ConfigFile): string {
  const tmp = path.join(base, "config.auto.json");
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  return tmp;
}

program
  .command("init")
  .description("Initialize a new chain folder")
  .argument("<name>")
  .requiredOption("-t, --template <template>", "counter|messages|ledger|interop|checkpoints", "counter")
  .action(async (name, opts) => {
    const dir = path.resolve(process.cwd(), name);
    await fsExtra.ensureDir(dir);
    const keysDir = path.join(dir, "keys");
    await fsExtra.ensureDir(keysDir);
    const key = await generateKeyPair();
    const keyPath = path.join(keysDir, "validator.json");
    await fsExtra.writeJSON(keyPath, key, { spaces: 2 });
    const chainId = `redbox-${name}`;
    const genesis: GenesisData = {
      chainId,
      validators: [{ name: "validator", pubKey: key.pubKey }],
      appState: defaultAppState(opts.template as TemplateName, key.pubKey)
    };
    const genesisPath = path.join(dir, "genesis.json");
    await fsExtra.writeJSON(genesisPath, genesis, { spaces: 2 });
    const config: ConfigFile = {
      chainId,
      stateMachine: opts.template,
      genesis: "./genesis.json",
      key: "./keys/validator.json",
      consensus: { type: "solo", validators: [{ name: "validator", pubKey: key.pubKey }] },
      api: { port: 26657 },
      p2p: { port: 26656, seeds: [] },
      storage: "./data"
    };
    const configPath = path.join(dir, "config.json");
    await fsExtra.writeJSON(configPath, config, { spaces: 2 });
    console.log(`Chain ${name} created at ${dir}`);
  });

const keysCmd = program.command("keys").description("Key management");
keysCmd
  .command("gen")
  .description("Generate an ed25519 keypair")
  .requiredOption("--out <dir>", "output directory")
  .action(async (opts) => {
    const kp = await generateKeyPair();
    await fsExtra.ensureDir(opts.out);
    const outPath = path.join(opts.out, "key.json");
    await fsExtra.writeJSON(outPath, kp, { spaces: 2 });
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
    const appState = opts.app ? readJSONMaybeYAML(path.resolve(opts.app)) : {};
    const genesis: GenesisData = {
      chainId: opts.chainId,
      validators: (opts.validators as string[]).map((pub: string, idx: number) => ({
        name: `val${idx + 1}`,
        pubKey: pub
      })),
      appState
    };
    await fsExtra.writeJSON(path.resolve(opts.out), genesis, { spaces: 2 });
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
    const id = calculateTxId(txBase as any);
    const signature = await signMessage(id, opts.priv);
    const tx = { ...txBase, id, signature };
    if (opts.out) {
      await fsExtra.writeJSON(path.resolve(opts.out), tx, { spaces: 2 });
      console.log(`Tx written to ${opts.out}`);
    } else {
      console.log(JSON.stringify(tx, null, 2));
    }
  });

program
  .command("explorer")
  .description("Run the explorer UI")
  .option("--host <host>", "host", "0.0.0.0")
  .option("--port <port>", "port", "5173")
  .action((opts) => {
    const child = spawn(
      "pnpm",
      ["--filter", "explorer", "dev", "--", "--host", opts.host, "--port", opts.port],
      { stdio: "inherit", cwd: path.join(process.cwd()) }
    );
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
