import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ApiConfig, Block, Transaction } from "./types";

type NodeHandle = {
  getStatus(): any;
  getState(): any;
  getStateAtHeight(height?: number): Promise<{ height: number; state: any } | undefined>;
  addTransaction(tx: Transaction): Promise<{ accepted: boolean; id: string }>;
  getBlock(height: number): Promise<Block | undefined>;
  getLatestBlock(): Promise<Block | undefined>;
  getBlocks(from: number, to: number): Promise<Block[]>;
  exportSnapshot(height?: number): Promise<{ chainId: string; height: number; blockHash: string | null; state: any } | undefined>;
  on(event: string, handler: (...args: any[]) => void): any;
  off?(event: string, handler: (...args: any[]) => void): any;
};

export interface ApiServer {
  stop(): Promise<void>;
}

export async function startApiServer(node: NodeHandle, config: ApiConfig): Promise<ApiServer> {
  const app = express();
  app.use(bodyParser.json());

  app.get("/status", (_req: Request, res: Response) => {
    res.json(node.getStatus());
  });

  app.get("/state", (_req: Request, res: Response) => {
    res.json(node.getState());
  });

  app.get("/state/:height", async (req: Request, res: Response) => {
    const height = Number(req.params.height);
    if (!Number.isFinite(height) || height < 0) return res.status(400).json({ error: "height must be >= 0" });
    const snapshot = await node.getStateAtHeight(height);
    if (!snapshot) return res.status(404).json({ error: "state not found" });
    res.json(snapshot);
  });

  app.get("/block/latest", async (_req: Request, res: Response) => {
    const block = await node.getLatestBlock();
    if (!block) return res.status(404).json({ error: "no blocks" });
    res.json(block);
  });

  app.get("/block/:height", async (req: Request, res: Response) => {
    const height = Number(req.params.height);
    const block = await node.getBlock(height);
    if (!block) return res.status(404).json({ error: "not found" });
    res.json(block);
  });

  app.post("/tx", async (req: Request, res: Response) => {
    try {
      const tx: Transaction = req.body;
      const result = await node.addTransaction(tx);
      res.json({ ok: true, id: result.id, accepted: result.accepted });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.get("/export/snapshot", async (req: Request, res: Response) => {
    const heightParam = req.query.height as string | undefined;
    const height = heightParam !== undefined ? Number(heightParam) : undefined;
    if (heightParam !== undefined) {
      if (!Number.isFinite(height) || (height as number) < 0) {
        return res.status(400).json({ error: "height must be >= 0" });
      }
    }
    const snapshot = await node.exportSnapshot(height);
    if (!snapshot) return res.status(404).json({ error: "snapshot not found" });
    res.json(snapshot);
  });

  app.get("/export/blocks", async (req: Request, res: Response) => {
    const status = node.getStatus();
    const latestHeight = status.height ?? 0;
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
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

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "status", data: node.getStatus() }));
    const blockHandler = (evt: any) => {
      ws.send(JSON.stringify({ type: "newBlock", data: evt }));
    };
    const txHandler = (tx: Transaction) => {
      ws.send(JSON.stringify({ type: "newTx", data: tx }));
    };
    const statusHandler = (st: any) => {
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

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host ?? "0.0.0.0", () => resolve());
  });

  return {
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      wss.close();
    }
  };
}
