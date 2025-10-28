// /src/app/api/admin/rewards/calc/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient"; // ✅ anon 클라이언트(현재 RLS disabled 가정)
import { getKSTISOString, getLastWeekRangeKST } from "@/lib/dateUtil";

export const dynamic = "force-dynamic";

/** 분배율(구독료 기준)
 *  - 추천: 50%
 *  - 센터: 20%
 *  (남은 30%는 집계 제외)
 */
const REFERRAL_RATE = 0.5;
const CENTER_RATE = 0.2;

/** (선택) pass_type → 기본가
 *  tuition 값이 '개월 수' 등으로 들어오는 경우 보정에 사용
 *  필요 없으면 비워도 됩니다.
 */
const PRICE_BY_PASS: Record<string, number> = {
  "100 ": 100,
  "300 ": 300,
  // 필요 시 추가
};

type EnrollmentRow = {
  ref_code: string;
  ref_by: string | null;
  center_id: string | null;
  pass_type: string | null;
  tuition: number | null;
  memo: string | null;
  created_at: string;
};

type UserSlim = {
  ref_code: string;
  name: string | null;
  wallet_address: string | null;
};

type Bucket = { ref_code: string; referral_amount: number; center_amount: number };

export async function POST() {
  try {
    // ✅ 이번 주 월요일 실행 가정 → 전주 월~일 집계
    const todayKst = getKSTISOString().slice(0, 10); // YYYY-MM-DD
    const range = getLastWeekRangeKST(todayKst);     // { gte, lt, period_start, period_end }

    // 1) enrollments: 전주 범위 + "결제 완료" 만 로드
    const { data: enrolls, error: loadErr } = await supabase
      .from("enrollments")
      .select(
        "ref_code, ref_by, center_id, pass_type, tuition, memo, created_at"
      )
      .gte("created_at", range.gte)
      .lt("created_at", range.lt)
      .eq("memo", "결제 완료");

    if (loadErr) throw loadErr;
    const rows = (enrolls ?? []) as EnrollmentRow[];
    if (!rows.length) {
      return NextResponse.json({ inserted: 0, updated: 0, message: "집계 대상 없음" });
    }

    // 2) 수혜자별 합산 버킷 (추천 50 / 센터 20)
    const buckets = new Map<string, Bucket>();

    for (const r of rows) {
      // 금액 결정: tuition(숫자) 우선
      let base = Number(r.tuition ?? 0);

      // tuition 이 1~12 같은 '개월 수'로 들어오면 pass 가격과 곱해서 보정
      const passPrice = PRICE_BY_PASS[String(r.pass_type ?? "")] ?? 0;
      if (passPrice > 0 && base > 0 && base <= 12) {
        base = base * passPrice;
      }

      if (!base || base <= 0) continue;

      // 추천 50%
      if (r.ref_by) {
        const k = String(r.ref_by);
        const b = buckets.get(k) ?? { ref_code: k, referral_amount: 0, center_amount: 0 };
        b.referral_amount += Math.floor(base * REFERRAL_RATE * 100) / 100; // 소수점 2자리 버림
        buckets.set(k, b);
      }

      // 센터 20%
      if (r.center_id) {
        const k = String(r.center_id);
        const b = buckets.get(k) ?? { ref_code: k, referral_amount: 0, center_amount: 0 };
        b.center_amount += Math.floor(base * CENTER_RATE * 100) / 100;
        buckets.set(k, b);
      }
    }

    if (buckets.size === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, message: "금액 집계 0" });
    }

    // 3) 수혜자 프로필(name, wallet_address) 보강
    const beneficiaryCodes = Array.from(buckets.keys());
    const { data: benUsers, error: benErr } = await supabase
      .from("users")
      .select("ref_code, name, wallet_address")
      .in("ref_code", beneficiaryCodes);
    if (benErr) throw benErr;

    const benMap = new Map(
      (benUsers as UserSlim[] | null)?.map(u => [u.ref_code, u]) ?? []
    );

    // 4) 업서트 payload 구성
    //    ⚠️ reward_transfers.total_amount 는 generated column이므로 넣지 않습니다.
    const rewardDate = todayKst;        // 실행일(월요일)을 정산일로 기록
    const nowIso = getKSTISOString();

    const upsertRows = beneficiaryCodes.map(code => {
      const b = buckets.get(code)!;
      const u = benMap.get(code);
      return {
        ref_code: code,
        name: u?.name ?? null,
        wallet_address: u?.wallet_address ?? null,
        referral_amount: Math.round((b.referral_amount ?? 0) * 100) / 100,
        center_amount: Math.round((b.center_amount ?? 0) * 100) / 100,
        status: "pending" as const,
        reward_date: rewardDate,
        created_at: nowIso,
        // reward_transfers 에 period_start/end 컬럼이 있으면 아래 2줄 주석해제
        // period_start: range.period_start,
        // period_end: range.period_end,
      };
    });

    // 5) 업서트 (유니크 키: ref_code + reward_date)
    const { data: up, error: upErr } = await supabase
      .from("reward_transfers")
      .upsert(upsertRows, { onConflict: "ref_code,reward_date" })
      .select("id");
    if (upErr) throw upErr;

    return NextResponse.json({
      inserted: up?.length ?? 0,
      rewardDate,
      period: { start: range.period_start, end: range.period_end },
    });
  } catch (e: any) {
    console.error("[/api/admin/rewards/calc] error:", e);
    return NextResponse.json({ message: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
