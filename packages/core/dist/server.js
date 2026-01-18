"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startApiServer = startApiServer;
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
async function startApiServer(node, config) {
    const app = (0, express_1.default)();
    app.use(body_parser_1.default.json());
    app.get("/status", (_req, res) => {
        res.json(node.getStatus());
    });
    app.get("/state", (_req, res) => {
        res.json(node.getState());
    });
    app.get("/state/:height", async (req, res) => {
        const height = Number(req.params.height);
        if (!Number.isFinite(height) || height < 0)
            return res.status(400).json({ error: "height must be >= 0" });
        const snapshot = await node.getStateAtHeight(height);
        if (!snapshot)
            return res.status(404).json({ error: "state not found" });
        res.json(snapshot);
    });
    app.get("/block/latest", async (_req, res) => {
        const block = await node.getLatestBlock();
        if (!block)
            return res.status(404).json({ error: "no blocks" });
        res.json(block);
    });
    app.get("/block/:height", async (req, res) => {
        const height = Number(req.params.height);
        const block = await node.getBlock(height);
        if (!block)
            return res.status(404).json({ error: "not found" });
        res.json(block);
    });
    app.post("/tx", async (req, res) => {
        try {
            const tx = req.body;
            const result = await node.addTransaction(tx);
            res.json({ ok: true, id: result.id, accepted: result.accepted });
        }
        catch (err) {
            res.status(400).json({ ok: false, error: err.message });
        }
    });
    app.get("/export/snapshot", async (req, res) => {
        const heightParam = req.query.height;
        const height = heightParam !== undefined ? Number(heightParam) : undefined;
        if (heightParam !== undefined) {
            if (!Number.isFinite(height) || height < 0) {
                return res.status(400).json({ error: "height must be >= 0" });
            }
        }
        const snapshot = await node.exportSnapshot(height);
        if (!snapshot)
            return res.status(404).json({ error: "snapshot not found" });
        res.json(snapshot);
    });
    app.get("/export/blocks", async (req, res) => {
        const status = node.getStatus();
        const latestHeight = status.height ?? 0;
        const fromParam = req.query.from;
        const toParam = req.query.to;
        const from = fromParam ? Number(fromParam) : latestHeight;
        const to = toParam ? Number(toParam) : latestHeight;
        if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0) {
            return res.status(400).json({ error: "from/to must be >= 0" });
        }
        if (from > to) {
            return res.status(400).json({ error: "from must be <= to" });
        }
        const maxRange = 200;
        if (to - from > maxRange) {
            return res.status(400).json({ error: `range too large; max ${maxRange + 1} blocks` });
        }
        const blocks = await node.getBlocks(from, to);
        res.json({ from, to: Math.min(to, latestHeight), blocks });
    });
    const server = http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws) => {
        ws.send(JSON.stringify({ type: "status", data: node.getStatus() }));
        const blockHandler = (evt) => {
            ws.send(JSON.stringify({ type: "newBlock", data: evt }));
        };
        const txHandler = (tx) => {
            ws.send(JSON.stringify({ type: "newTx", data: tx }));
        };
        const statusHandler = (st) => {
            ws.send(JSON.stringify({ type: "status", data: st }));
        };
        node.on("block", blockHandler);
        node.on("tx", txHandler);
        node.on("status", statusHandler);
        ws.on("close", () => {
            node.off?.("block", blockHandler);
            node.off?.("tx", txHandler);
            node.off?.("status", statusHandler);
        });
    });
    await new Promise((resolve) => {
        server.listen(config.port, config.host ?? "0.0.0.0", () => resolve());
    });
    return {
        stop: async () => {
            await new Promise((resolve) => server.close(() => resolve()));
            wss.close();
        }
    };
}
