import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKSTISOString } from "@/lib/dateUtil"; // joined_date는 DB가 자동 계산

// ✅ 서버 전용: 서비스 롤 키 사용
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ MK 접두사 최대값 + 1 생성
async function generateNextReferralCode(): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("ref_code")
    .ilike("ref_code", "MK%")
    .limit(2000);

  if (error) {
    console.error("❌ ref_code 조회 실패:", error.message);
    throw new Error("ref_code 조회 실패");
  }

  let maxNum = 1000; // 시작 MK1000 → 첫 신규는 MK1001
  (data ?? []).forEach((r) => {
    const m = /^MK(\d+)$/.exec((r.ref_code || "").trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) maxNum = Math.max(maxNum, n);
    }
  });

  return `MK${maxNum + 1}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      wallet_address,
      email = "",
      phone = "01000000000",
      ref_by = "MK1001",
      name = "",
      inviter_name = null, // 선택값
      okx_uid = null,    // 선택값
    } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: "지갑 주소는 필수입니다." }, { status: 400 });
    }

    const normalizedAddress = String(wallet_address).toLowerCase();

    // 🔍 중복 사용자 확인(지갑 → 이메일 순)
    let existing: any = null;
    if (normalizedAddress) {
      const { data: u1, error: e1 } = await supabase
        .from("users")
        .select("id, ref_code")
        .eq("wallet_address", normalizedAddress)
        .maybeSingle();
      if (e1) throw e1;
      existing = u1 ?? existing;
    }
    if (!existing && email) {
      const { data: u2, error: e2 } = await supabase
        .from("users")
        .select("id, ref_code")
        .eq("email", email)
        .maybeSingle();
      if (e2) throw e2;
      existing = u2 ?? existing;
    }

    if (existing) {
      return NextResponse.json({
        message: "이미 등록된 유저입니다.",
        id: existing.id,
        ref_code: existing.ref_code,
      });
    }

    // 🧠 추천인 → 센터 계산
    let center_id = "MK1001";
    if (ref_by) {
      const { data: referrer, error: referrerError } = await supabase
        .from("users")
        .select("center_id, ref_code")
        .eq("ref_code", ref_by)
        .maybeSingle();
      if (referrerError) {
        console.error("❌ 추천인 정보 조회 실패:", referrerError.message);
        return NextResponse.json({ error: "추천인 정보 조회 실패" }, { status: 500 });
      }
      if (referrer) center_id = referrer.center_id || "MK1001";
    }

    // ✅ KST 기준 가입시각 (joined_date는 DB가 자동 계산)
    const joinedAt = getKSTISOString();
    const finalName = name?.trim() || null;

    // 🆕 ref_code 생성
    const ref_code = await generateNextReferralCode();

    const baseInsert = {
      wallet_address: normalizedAddress,
      email,
      phone,
      name: finalName,
      inviter_name,
      okx_uid,
      ref_code,         // NOT NULL + UNIQUE
      ref_by,
      center_id,
      joined_at: joinedAt,
      gas_grant: false,
      // ⚠️ joined_date는 넣지 않음 (DB 자동)
    };

    // 1차 삽입
    let { data: inserted, error: insertError } = await supabase
      .from("users")
      .insert(baseInsert)
      .select("id, ref_code")
      .single();

    // UNIQUE 충돌 시 1회 재시도
    if (insertError && String(insertError.message).includes("users_ref_code_uq")) {
      const ref_code2 = await generateNextReferralCode();
      const retryInsert = { ...baseInsert, ref_code: ref_code2 };
      const retry = await supabase
        .from("users")
        .insert(retryInsert)
        .select("id, ref_code")
        .single();
      inserted = retry.data;
      insertError = retry.error;
    }

    if (insertError) {
      console.error("❌ 등록 실패:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "등록 완료",
      id: inserted!.id,
      ref_code: inserted!.ref_code,
    });
  } catch (err: any) {
    console.error("❌ /api/register 실패:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
