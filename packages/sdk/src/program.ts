import anchor from "@coral-xyz/anchor";
import type { Provider, Wallet } from "@coral-xyz/anchor";
const { AnchorProvider, Program } = anchor;
type Program<T extends anchor.Idl> = anchor.Program<T>;
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { IDL, type Gigawatt } from "./constants.js";

/** Build a Program<Gigawatt> from any Anchor provider (wallet adapter or keypair). */
export function getProgram(provider: Provider): Program<Gigawatt> {
  return new Program<Gigawatt>(IDL, provider);
}

/** Read-only program for RPC fetches (no signer). */
export function getReadonlyProgram(connection: Connection): Program<Gigawatt> {
  const dummy: Wallet = {
    publicKey: PublicKey.default,
    payer: Keypair.generate(),
    signTransaction: async <T>(tx: T) => tx,
    signAllTransactions: async <T>(txs: T[]) => txs,
  } as unknown as Wallet;
  const provider = new AnchorProvider(connection, dummy, { commitment: "confirmed" });
  return new Program<Gigawatt>(IDL, provider);
}
