// Single import point for the on-chain SDK, so the rest of the app is insulated from its exact shape.
export { IDL, PROGRAM_ID, findConfig, findFlush, findClaimStatus, findAsk, findWattMint, rewardsVault, getReadonlyProgram, contextFromConfig, buyWatt, activate, claim, claimAndActivate, placeAsk, cancelAsk, fillAsk } from "@gigawatt/sdk";
export type { GigawattProgram, ProgramContext } from "@gigawatt/sdk";
