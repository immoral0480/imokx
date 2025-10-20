import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { ref_code } = await req.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // 서버 전용
    const sb = createClient(url, key);

    const { data, error } = await sb
      .from("bot_status_history")
      .select("status,message,created_at")
      .eq("ref_code", ref_code)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    const latest = data?.[0] ?? null;
    return NextResponse.json({ success: true, latest });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "error" },
      { status: 200 }
    );
  }
}
