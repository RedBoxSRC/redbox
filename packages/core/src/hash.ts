import crypto from "crypto";
import stringify from "json-stable-stringify";
import { Block, Transaction } from "./types";

export function canonicalJson(value: any): string {
  return stringify(value) ?? "";
}

export function hashObject(value: any): string {
  const input = canonicalJson(value);
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function calculateTxId(tx: Omit<Transaction, "id"> | Transaction): string {
  return hashObject({
    type: tx.type,
    payload: tx.payload,
    senderPubKey: tx.senderPubKey ?? null
  });
}

export function calculateBlockHash(block: Omit<Block, "blockHash" | "signature">): string {
  return hashObject({
    height: block.height,
    timestamp: block.timestamp,
    prevHash: block.prevHash,
    txs: block.txs,
    proposerPubKey: block.proposerPubKey
  });
}
