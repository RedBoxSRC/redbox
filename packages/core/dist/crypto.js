"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeyPair = generateKeyPair;
exports.signMessage = signMessage;
exports.verifyMessage = verifyMessage;
const ed25519_1 = require("@noble/ed25519");
async function generateKeyPair() {
    const priv = ed25519_1.utils.randomPrivateKey();
    const privHex = Buffer.from(priv).toString("hex");
    const pubHex = Buffer.from(await (0, ed25519_1.getPublicKey)(priv)).toString("hex");
    return { privKey: privHex, pubKey: pubHex };
}
async function signMessage(messageHex, privKeyHex) {
    const privBytes = Buffer.from(privKeyHex, "hex");
    const sig = await (0, ed25519_1.sign)(Buffer.from(messageHex, "hex"), privBytes);
    return Buffer.from(sig).toString("hex");
}
async function verifyMessage(messageHex, signatureHex, pubKeyHex) {
    const msg = Buffer.from(messageHex, "hex");
    const sig = Buffer.from(signatureHex, "hex");
    const pub = Buffer.from(pubKeyHex, "hex");
    return (0, ed25519_1.verify)(sig, msg, pub);
}
