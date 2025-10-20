// app/api/admin/rewards/transfer/route.ts
import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";
import { sendUSDT } from "@/lib/sendUSDT";
import { getKSTDateString, getKSTISOString } from "@/lib/dateUtil";

export async function GET(req: Request) { return POST(req); }

export async function POST(req?: Request) {
  let body: any = {};
  if (req) { try { body = await req.json(); } catch {} }
  const today = getKSTDateString();
  const rewardDate: string = body?.rewardDate || today;
  const retryFailed: boolean = body?.retryFailed ?? true;   // ← 기본 재시도 ON
  const minAmount: number = Number(body?.minAmount ?? 0);
  const limit: number = Math.min(Number(body?.limit ?? 500), 1000);
  const dryRun: boolean = !!body?.dryRun;

  console.log("▶ transfer run", { rewardDate, retryFailed, minAmount, limit, dryRun });

  // 1) 대상 조회
  let q = supabase
    .from("reward_transfers")
    .select("id, ref_code, wallet_address, total_amount, status, reward_date")
    .eq("reward_date", rewardDate);

  q = retryFailed ? q.in("status", ["pending", "failed"]) : q.eq("status", "pending");
  if (minAmount > 0) q = q.gt("total_amount", minAmount);

  const { data: transfers, error } = await q.order("total_amount", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ message: "대상 로드 실패", detail: error }, { status: 500 });

  const targets = (transfers ?? []).filter(r => !!r.wallet_address && Number(r.total_amount) > 0);
  if (targets.length === 0) return NextResponse.json({ processed: 0, completed: 0, failed: 0, rewardDate });

  if (dryRun) {
    return NextResponse.json({ processed: targets.length, completed: targets.length, failed: 0, rewardDate, dryRun: true });
  }

  // 2) 전송 루프
  let processed = 0, completed = 0, failed = 0;
  const results: any[] = [];

  for (const t of targets) {
    processed += 1;
    const id = t.id as string;
    const to = t.wallet_address as string;
    const amount = Number(t.total_amount);

    try {
      const { transactionHash } = await sendUSDT(to, amount);

      await supabase.from("reward_transfers").update({
        tx_hash: transactionHash,
        status: "completed",             // ✅ 성공 시 completed
        error_message: null,
        executed_at: getKSTISOString(),
      }).eq("id", id);

      completed += 1;
      results.push({ id, ref_code: t.ref_code, tx_hash: transactionHash });
    } catch (e: any) {
      const msg = e?.message || "transfer_failed";
      await supabase.from("reward_transfers").update({
        status: "failed",
        error_message: msg,
        executed_at: getKSTISOString(),
      }).eq("id", id);

      failed += 1;
      results.push({ id, ref_code: t.ref_code, error: msg });
    }
  }

  return NextResponse.json({ processed, completed, failed, rewardDate, results });
}
