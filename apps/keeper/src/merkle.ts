// Re-export of the shared merkle lib (packages/sdk/src/merkle.ts once it exists).
export { buildTree, hashLeaf, hashNode } from "./sdk.js";
export type { MerkleTree, MerkleLeafInput } from "./sdk.js";

export const toHex = (b: Uint8Array): string => "0x" + Buffer.from(b).toString("hex");
