import { NodeKey } from "./types";
export declare function generateKeyPair(): Promise<NodeKey>;
export declare function signMessage(messageHex: string, privKeyHex: string): Promise<string>;
export declare function verifyMessage(messageHex: string, signatureHex: string, pubKeyHex: string): Promise<boolean>;
//# sourceMappingURL=crypto.d.ts.map