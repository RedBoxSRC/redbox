import { EventEmitter } from "events";
import WebSocket, { WebSocketServer } from "ws";
import { Block, P2PAdapter, Transaction } from "@redbox/core";

export interface P2PNodeOptions {
  port: number;
  seeds?: string[];
  chainId: string;
  getLatestHeight: () => number;
  getBlock: (height: number) => Promise<Block | undefined>;
}

type GossipMessage =
  | { type: "status"; height: number; chainId: string }
  | { type: "tx"; chainId: string; tx: Transaction }
  | { type: "block"; chainId: string; block: Block }
  | { type: "getBlocks"; chainId: string; from: number; to: number }
  | { type: "blocks"; chainId: string; blocks: Block[] };

export class P2PNode extends EventEmitter implements P2PAdapter {
  private opts: P2PNodeOptions;
  private peers: Set<WebSocket> = new Set();
  private server?: WebSocketServer;
  private seedSockets: Map<string, WebSocket> = new Map();
  private reconnectTimer?: NodeJS.Timeout;

  constructor(opts: P2PNodeOptions) {
    super();
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.server = new WebSocketServer({ port: this.opts.port });
    this.server.on("connection", (ws) => this.handleConnection(ws));
    for (const seed of this.opts.seeds ?? []) {
      this.connectToSeed(seed);
    }
    this.reconnectTimer = setInterval(() => this.retrySeeds(), 5000);
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }
    for (const peer of this.peers) {
      peer.close();
    }
    for (const [, peer] of this.seedSockets) {
      peer.close();
    }
    if (this.server) {
      this.server.close();
    }
  }

  broadcastTx(tx: Transaction): void {
    this.broadcast({ type: "tx", chainId: this.opts.chainId, tx });
  }

  broadcastBlock(block: Block): void {
    this.broadcast({ type: "block", chainId: this.opts.chainId, block });
  }

  private handleConnection(ws: WebSocket): void {
    this.peers.add(ws);
    ws.on("message", (raw) => this.handleMessage(ws, raw.toString()));
    ws.on("close", () => this.peers.delete(ws));
    // share status on new connections
    this.send(ws, { type: "status", height: this.opts.getLatestHeight(), chainId: this.opts.chainId });
  }

  private connectToSeed(url: string): void {
    const existing = this.seedSockets.get(url);
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws = new WebSocket(url);
    this.seedSockets.set(url, ws);
    ws.on("open", () => this.handleConnection(ws));
    ws.on("close", () => {
      this.peers.delete(ws);
      this.seedSockets.delete(url);
    });
    ws.on("error", () => {
      this.seedSockets.delete(url);
      ws.close();
    });
  }

  private retrySeeds(): void {
    for (const seed of this.opts.seeds ?? []) {
      this.connectToSeed(seed);
    }
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw) as GossipMessage;
      if ("chainId" in msg && msg.chainId !== this.opts.chainId) {
        ws.close();
        return;
      }
      switch (msg.type) {
        case "status": {
          if (msg.chainId !== this.opts.chainId) {
            ws.close();
            return;
          }
          const localHeight = this.opts.getLatestHeight();
          if (msg.height > localHeight) {
            this.send(ws, {
              type: "getBlocks",
              chainId: this.opts.chainId,
              from: localHeight + 1,
              to: msg.height
            });
          }
          break;
        }
        case "tx":
          this.emit("tx", msg.tx);
          break;
        case "block":
          this.emit("block", msg.block);
          break;
        case "getBlocks": {
          const blocks: Block[] = [];
          for (let h = msg.from; h <= msg.to; h++) {
            const block = await this.opts.getBlock(h);
            if (block) blocks.push(block);
          }
          this.send(ws, { type: "blocks", chainId: this.opts.chainId, blocks });
          break;
        }
        case "blocks":
          for (const block of msg.blocks) {
            this.emit("block", block);
          }
          break;
      }
    } catch (err) {
      this.emit("warn", err);
    }
  }

  private send(ws: WebSocket, msg: GossipMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: GossipMessage): void {
    for (const peer of this.peers) {
      this.send(peer, msg);
    }
  }
}
