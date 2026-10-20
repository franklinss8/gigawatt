import { listModels } from "@/lib/openrouter";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() {
  const models = await listModels();
  return json({ object: "list", data: models.map(m => ({ id: m.id, object: "model", created: m.created ?? 0, owned_by: m.id.split("/")[0], name: m.name, context_length: m.context_length, pricing: m.pricing })) });
}
