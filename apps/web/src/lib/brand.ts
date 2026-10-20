export const BRAND = {
  name: "Gigawatt",
  domain: "gigawatt.fun",
  tagline: "Hold the token. Own the compute.",
  launchToken: "GWATT",
  creditToken: "WATT",
  keyPrefix: "sk-gw-",
  x: "https://x.com/gigawattfun",
  telegram: "https://t.me/gigawattfun",
  pumpfun: (mint: string) => `https://pump.fun/coin/${mint}`,
  purchaseFeeBps: 500,
  activationFeeBps: 500,
  buyerFeeBps: 100,
} as const;

export const LABS = [
  "Anthropic", "OpenAI", "Google", "xAI", "DeepSeek", "Mistral AI", "Qwen", "Meta",
  "Moonshot AI", "Z.ai", "MiniMax", "NVIDIA", "Microsoft", "Amazon", "Cohere",
  "Perplexity", "ByteDance Seed", "Nous Research",
];
