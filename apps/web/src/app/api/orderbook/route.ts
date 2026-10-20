import { readOrderBook } from "@/lib/chain";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() { return json(await readOrderBook().catch(() => ({ asks: [], fills: [], slot: 0 }))); }
