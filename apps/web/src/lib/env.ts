export const env = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
  cluster: (process.env.NEXT_PUBLIC_CLUSTER || "devnet") as "devnet" | "mainnet-beta",
  programId: process.env.NEXT_PUBLIC_PROGRAM_ID || "",
  gwattMint: process.env.NEXT_PUBLIC_GWATT_MINT || "",
  wattMint: process.env.NEXT_PUBLIC_WATT_MINT || "",
  usdcMint: process.env.NEXT_PUBLIC_USDC_MINT || "",
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  keeperSecret: process.env.KEEPER_SECRET || "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

export const chainConfigured = () => !!(env.programId && env.gwattMint && env.wattMint && env.usdcMint);
export const explorerUrl = (kind: "address" | "tx", value: string) =>
  `https://explorer.solana.com/${kind}/${value}${env.cluster === "devnet" ? "?cluster=devnet" : ""}`;
