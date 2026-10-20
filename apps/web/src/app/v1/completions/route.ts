import { NextRequest } from "next/server";
import { proxyToOpenRouter } from "@/lib/proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const POST = (req: NextRequest) => proxyToOpenRouter(req, "completions");
