import { Level } from "level";
import { Block, BlockStore } from "@redbox/core";

export class LevelBlockStore implements BlockStore {
  private db: Level<string, string>;
  private initialized = false;

  constructor(private path: string) {
    this.db = new Level(path, { valueEncoding: "utf8" });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.db.get("height");
    } catch {
      await this.db.put("height", "0");
    }
    this.initialized = true;
  }

  async getLatestHeight(): Promise<number> {
    const h = await this.db.get("height");
    return Number(h);
  }

  async getBlock(height: number): Promise<Block | undefined> {
    try {
      const raw = await this.db.get(`block:${height}`);
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async putBlock(block: Block, stateSnapshot: any): Promise<void> {
    await this.db.put(`block:${block.height}`, JSON.stringify(block));
    await this.db.put(`state:${block.height}`, JSON.stringify(stateSnapshot));
    await this.db.put("height", block.height.toString());
  }

  async getState(height: number): Promise<any | undefined> {
    try {
      const raw = await this.db.get(`state:${height}`);
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async getLatestState(): Promise<{ height: number; state: any } | undefined> {
    const height = await this.getLatestHeight();
    const state = await this.getState(height);
    if (state === undefined) return undefined;
    return { height, state };
  }
}
