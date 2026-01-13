"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LevelBlockStore = void 0;
const level_1 = require("level");
class LevelBlockStore {
    constructor(path) {
        this.path = path;
        this.initialized = false;
        this.db = new level_1.Level(path, { valueEncoding: "utf8" });
    }
    async init() {
        if (this.initialized)
            return;
        try {
            await this.db.get("height");
        }
        catch {
            await this.db.put("height", "0");
        }
        this.initialized = true;
    }
    async getLatestHeight() {
        const h = await this.db.get("height");
        return Number(h);
    }
    async getBlock(height) {
        try {
            const raw = await this.db.get(`block:${height}`);
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    async putBlock(block, stateSnapshot) {
        await this.db.put(`block:${block.height}`, JSON.stringify(block));
        await this.db.put(`state:${block.height}`, JSON.stringify(stateSnapshot));
        await this.db.put("height", block.height.toString());
    }
    async getState(height) {
        try {
            const raw = await this.db.get(`state:${height}`);
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    async getLatestState() {
        const height = await this.getLatestHeight();
        const state = await this.getState(height);
        if (state === undefined)
            return undefined;
        return { height, state };
    }
}
exports.LevelBlockStore = LevelBlockStore;
