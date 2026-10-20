import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@gigawatt/sdk"],
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
    resolveAlias: { "pino-pretty": { browser: "./empty.js" } },
  },
};
export default nextConfig;
