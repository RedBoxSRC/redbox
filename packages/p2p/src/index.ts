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
  | { type: "tx"; tx: Transaction }
  | { type: "block"; block: Block }
  | { type: "getBlocks"; from: number; to: number }
  | { type: "blocks"; blocks: Block[] };

export class P2PNode extends EventEmitter implements P2PAdapter {
  private opts: P2PNodeOptions;
  private peers: Set<WebSocket> = new Set();
  private server?: WebSocketServer;

  constructor(opts: P2PNodeOptions) {
    super();
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.server = new WebSocketServer({ port: this.opts.port });
    this.server.on("connection", (ws) => this.handleConnection(ws));
    for (const seed of this.opts.seeds ?? []) {
      this.connectToPeer(seed);
    }
  }

  async stop(): Promise<void> {
    for (const peer of this.peers) {
      peer.close();
    }
    if (this.server) {
      this.server.close();
    }
  }

  broadcastTx(tx: Transaction): void {
    this.broadcast({ type: "tx", tx });
  }

  broadcastBlock(block: Block): void {
    this.broadcast({ type: "block", block });
  }

  private handleConnection(ws: WebSocket): void {
    this.peers.add(ws);
    ws.on("message", (raw) => this.handleMessage(ws, raw.toString()));
    ws.on("close", () => this.peers.delete(ws));
    // share status on new connections
    this.send(ws, { type: "status", height: this.opts.getLatestHeight(), chainId: this.opts.chainId });
  }

  private connectToPeer(url: string): void {
    const ws = new WebSocket(url);
    ws.on("open", () => this.handleConnection(ws));
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw) as GossipMessage;
      switch (msg.type) {
        case "status": {
          if (msg.chainId !== this.opts.chainId) {
            ws.close();
            return;
          }
          const localHeight = this.opts.getLatestHeight();
          if (msg.height > localHeight) {
            this.send(ws, { type: "getBlocks", from: localHeight + 1, to: msg.height });
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
          this.send(ws, { type: "blocks", blocks });
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
