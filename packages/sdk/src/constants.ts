import { PublicKey } from "@solana/web3.js";
import idlJson from "./idl.json" with { type: "json" };
import type { Gigawatt } from "./types.js";

export const IDL = idlJson as Gigawatt;
export const PROGRAM_ID = new PublicKey(idlJson.address);

export const WATT_DECIMALS = 6;
export const WATT_UNIT = 1_000_000n;
export const BPS_DENOMINATOR = 10_000n;

export type { Gigawatt };
