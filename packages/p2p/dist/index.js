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
Object.defineProperty(exports, "__esModule", { value: true });
exports.P2PNode = void 0;
const events_1 = require("events");
const ws_1 = __importStar(require("ws"));
class P2PNode extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.peers = new Set();
        this.opts = opts;
    }
    async start() {
        this.server = new ws_1.WebSocketServer({ port: this.opts.port });
        this.server.on("connection", (ws) => this.handleConnection(ws));
        for (const seed of this.opts.seeds ?? []) {
            this.connectToPeer(seed);
        }
    }
    async stop() {
        for (const peer of this.peers) {
            peer.close();
        }
        if (this.server) {
            this.server.close();
        }
    }
    broadcastTx(tx) {
        this.broadcast({ type: "tx", tx });
    }
    broadcastBlock(block) {
        this.broadcast({ type: "block", block });
    }
    handleConnection(ws) {
        this.peers.add(ws);
        ws.on("message", (raw) => this.handleMessage(ws, raw.toString()));
        ws.on("close", () => this.peers.delete(ws));
        // share status on new connections
        this.send(ws, { type: "status", height: this.opts.getLatestHeight(), chainId: this.opts.chainId });
    }
    connectToPeer(url) {
        const ws = new ws_1.default(url);
        ws.on("open", () => this.handleConnection(ws));
    }
    async handleMessage(ws, raw) {
        try {
            const msg = JSON.parse(raw);
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
                    const blocks = [];
                    for (let h = msg.from; h <= msg.to; h++) {
                        const block = await this.opts.getBlock(h);
                        if (block)
                            blocks.push(block);
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
        }
        catch (err) {
            this.emit("warn", err);
        }
    }
    send(ws, msg) {
        if (ws.readyState === ws_1.default.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }
    broadcast(msg) {
        for (const peer of this.peers) {
            this.send(peer, msg);
        }
    }
}
exports.P2PNode = P2PNode;
