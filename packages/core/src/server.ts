import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ApiConfig, Block, Transaction } from "./types";

type NodeHandle = {
  getStatus(): any;
  getState(): any;
  addTransaction(tx: Transaction): Promise<{ accepted: boolean; id: string }>;
  getBlock(height: number): Promise<Block | undefined>;
  getLatestBlock(): Promise<Block | undefined>;
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
    node.on("block", blockHandler);
    node.on("tx", txHandler);
    ws.on("close", () => {
      node.off?.("block", blockHandler);
      node.off?.("tx", txHandler);
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
