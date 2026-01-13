import { utils, sign, verify, getPublicKey } from "@noble/ed25519";
import { NodeKey } from "./types";

export async function generateKeyPair(): Promise<NodeKey> {
  const priv = utils.randomPrivateKey();
  const privHex = Buffer.from(priv).toString("hex");
  const pubHex = Buffer.from(await getPublicKey(priv)).toString("hex");
  return { privKey: privHex, pubKey: pubHex };
}

export async function signMessage(messageHex: string, privKeyHex: string): Promise<string> {
  const privBytes = Buffer.from(privKeyHex, "hex");
  const sig = await sign(Buffer.from(messageHex, "hex"), privBytes);
  return Buffer.from(sig).toString("hex");
}

export async function verifyMessage(messageHex: string, signatureHex: string, pubKeyHex: string): Promise<boolean> {
  const msg = Buffer.from(messageHex, "hex");
  const sig = Buffer.from(signatureHex, "hex");
  const pub = Buffer.from(pubKeyHex, "hex");
  return verify(sig, msg, pub);
}
