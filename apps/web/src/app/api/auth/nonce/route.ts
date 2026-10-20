import { issueNonce } from "@/lib/auth";
import { json } from "@/lib/proxy";
export async function POST(req: Request) {
  const { wallet } = await req.json();
  if (typeof wallet !== "string" || wallet.length < 32) return json({ error: "wallet required" }, 400);
  return json(await issueNonce(wallet));
}
