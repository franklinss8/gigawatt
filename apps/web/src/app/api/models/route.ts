import { listModels, labOf } from "@/lib/openrouter";
import { json } from "@/lib/proxy";
export const revalidate = 600;
export async function GET() {
  const models = await listModels();
  return json({ count: models.length, models: models.map(m => ({ id: m.id, name: m.name, lab: labOf(m.id), context_length: m.context_length, prompt: Number(m.pricing.prompt) * 1e6, completion: Number(m.pricing.completion) * 1e6, modality: m.architecture?.modality })) });
}
