import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() { return json({ flushes: await db().listFlushes(48) }); }
