// src/app/api/stop-bot/route.ts
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const REMOTE = process.env.REMOTE_API_BASE || "https://snowmart.co.kr";

  try {
    const body = await req.json();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const r = await fetch(`${REMOTE}/stop-bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message ?? "proxy_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
