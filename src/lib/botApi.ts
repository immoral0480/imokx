// src/lib/botApi.ts
const API_BASE =
  (process.env.NEXT_PUBLIC_REMOTE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

function joinUrl(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

async function postJSON<T = any>(path: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const { controller, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(joinUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = "요청 실패";
      try { detail = (JSON.parse(text)?.detail ?? detail); } catch { if (text) detail = text; }
      throw new Error(`${res.status} - ${detail}`);
    }
    try { return JSON.parse(text) as T; } catch { return {} as T; }
  } finally {
    clear();
  }
}

export const startBot = (refCode: string) => postJSON("/start-bot", { ref_code: refCode });
export const stopBot  = (refCode: string) => postJSON("/stop-bot",  { ref_code: refCode });
