import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["@coral-xyz/anchor"],
  transpilePackages: ["@gigawatt/sdk"],
  turbopack: { resolveAlias: { "pino-pretty": { browser: "./empty.js" } } },
};
export default nextConfig;
