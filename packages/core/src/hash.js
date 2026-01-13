"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJson = canonicalJson;
exports.hashObject = hashObject;
exports.calculateTxId = calculateTxId;
exports.calculateBlockHash = calculateBlockHash;
const crypto_1 = __importDefault(require("crypto"));
const json_stable_stringify_1 = __importDefault(require("json-stable-stringify"));
function canonicalJson(value) {
    return (0, json_stable_stringify_1.default)(value) ?? "";
}
function hashObject(value) {
    const input = canonicalJson(value);
    return crypto_1.default.createHash("sha256").update(input).digest("hex");
}
function calculateTxId(tx) {
    return hashObject({
        type: tx.type,
        payload: tx.payload,
        senderPubKey: tx.senderPubKey ?? null
    });
}
function calculateBlockHash(block) {
    return hashObject({
        height: block.height,
        timestamp: block.timestamp,
        prevHash: block.prevHash,
        txs: block.txs,
        proposerPubKey: block.proposerPubKey
    });
}
