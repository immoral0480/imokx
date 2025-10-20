import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { ref_code } = await req.json();

    if (!process.env.NEXT_PUBLIC_API_URL) {
      throw new Error("NEXT_PUBLIC_API_URL not set");
    }

    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/is-bot-running`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref_code }),
      // 필요시 타임아웃 컨트롤: fetch timeout 래퍼를 별도 작성해서 사용
    });

    if (!resp.ok) throw new Error(`FastAPI ${resp.status}`);
    const json = await resp.json(); // { running: boolean }

    return NextResponse.json({
      success: true,
      status: json.running ? "running" : "stopped",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, status: "unknown", error: e?.message ?? "error" },
      { status: 200 }
    );
  }
}
