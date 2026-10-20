import { siteStats } from "@/lib/stats";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() { return json(await siteStats()); }
