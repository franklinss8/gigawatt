import { env } from "./env";

export type ORModel = {
  id: string; name: string; description?: string; context_length?: number; created?: number;
  pricing: { prompt: string; completion: string; image?: string; request?: string };
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number };
};

export const OPENROUTER = "https://openrouter.ai/api/v1";
export const OR_PLATFORM_FEE = 0.05; // OpenRouter's fee on credits. Gigawatt adds no markup.

let cache: { at: number; models: ORModel[] } | null = null;
export async function listModels(): Promise<ORModel[]> {
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache.models;
  try {
    const r = await fetch(`${OPENROUTER}/models`, { next: { revalidate: 600 } });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    cache = { at: Date.now(), models: j.data as ORModel[] };
    return cache.models;
  } catch {
    return cache?.models ?? FALLBACK_MODELS;
  }
}

/** Cost in USD for a request, OpenRouter list price + its 5 % platform fee. */
export function costOf(model: ORModel | undefined, inputTokens: number, outputTokens: number) {
  if (!model) return 0;
  const base = inputTokens * Number(model.pricing.prompt) + outputTokens * Number(model.pricing.completion) + Number(model.pricing.request || 0);
  return Math.round(base * (1 + OR_PLATFORM_FEE) * 1e8) / 1e8;
}

export const labOf = (id: string) => {
  const p = id.split("/")[0];
  const map: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", "x-ai": "xAI", deepseek: "DeepSeek", mistralai: "Mistral AI", qwen: "Qwen", "meta-llama": "Meta", moonshotai: "Moonshot AI", "z-ai": "Z.ai", minimax: "MiniMax", nvidia: "NVIDIA", microsoft: "Microsoft", amazon: "Amazon", cohere: "Cohere", perplexity: "Perplexity", bytedance: "ByteDance Seed", nousresearch: "Nous Research" };
  return map[p] ?? p;
};

export const FALLBACK_MODELS: ORModel[] = [
  { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5", context_length: 1000000, pricing: { prompt: "0.000003", completion: "0.000015" } },
  { id: "anthropic/claude-haiku-4.5", name: "Anthropic: Claude Haiku 4.5", context_length: 200000, pricing: { prompt: "0.000001", completion: "0.000005" } },
  { id: "openai/gpt-5", name: "OpenAI: GPT-5", context_length: 400000, pricing: { prompt: "0.00000125", completion: "0.00001" } },
  { id: "google/gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", context_length: 1048576, pricing: { prompt: "0.0000003", completion: "0.0000025" } },
  { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek: V3.1", context_length: 163840, pricing: { prompt: "0.0000002", completion: "0.0000008" } },
  { id: "qwen/qwen3-coder", name: "Qwen: Qwen3 Coder", context_length: 262144, pricing: { prompt: "0.0000002", completion: "0.0000008" } },
];
