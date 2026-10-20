import { logout } from "@/lib/auth";
import { json } from "@/lib/proxy";
export async function POST() { await logout(); return json({ ok: true }); }
