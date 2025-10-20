// src/app/api/start-bot/route.ts
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const REMOTE = process.env.REMOTE_API_BASE || "https://snowmart.co.kr";

  try {
    const body = await req.json();

    // 15초 타임아웃
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const r = await fetch(`${REMOTE}/start-bot`, {
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
    // 프록시 레벨 오류(네트워크, 타임아웃 등)
    return new Response(JSON.stringify({ success: false, error: e?.message ?? "proxy_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
