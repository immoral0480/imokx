"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { getContract } from "thirdweb";
import { balanceOf } from "thirdweb/extensions/erc20";
import { polygon } from "thirdweb/chains";

import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import PassPurchaseModal from "@/components/PassPurchaseModal";
import { client } from "@/lib/client";

// ✅ 구독 상태 조회용
import { supabase } from "@/lib/supabaseClient";

const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

// 제목 비교 시 공백 차이 방지
const normalize = (s: string) => (s || "").replace(/\s+/g, "").toLowerCase().trim();
// 숫자 비교 보강용(100/300/600/1200)
const leadNum = (s?: string) => {
  const m = (s ?? "").toString().match(/\d+/);
  return m ? m[0] : "";
};

// (선택) 가격→타이틀 매핑 (유지)
const PASS_TITLE_BY_PRICE: Record<number, string> = {
  100: "100 USDT",
  300: "300 USDT",
  600: "600 USDT",
  1200: "1200 USDT",
};

type CurrentPass = {
  title: string;
  expiresAt: string; // YYYY-MM-DD
};

export default function HomePage() {
  const account = useActiveAccount();
  const address =
    account?.address?.toLowerCase() || "0x0000000000000000000000000000000000000000";
  const router = useRouter();
  const balanceCalled = useRef(false);

  const [usdtBalance, setUsdtBalance] = useState("조회 중...");
  const [selectedPass, setSelectedPass] = useState<{
    name: string;
    period: string;
    price: number;
    image: string;
  } | null>(null);

  // ✅ 구독 상태
  const [hasMembership, setHasMembership] = useState(false);
  const [currentPass, setCurrentPass] = useState<CurrentPass | null>(null);
  const [refCode, setRefCode] = useState<string>("");

  const usdtContract = useMemo(
    () => getContract({ client, chain: polygon, address: USDT_ADDRESS }),
    []
  );

  useEffect(() => {
    if (
      !account?.address ||
      account.address === "0x0000000000000000000000000000000000000000"
    ) {
      router.replace("/");
    }
  }, [account?.address, router]);

  useEffect(() => {
    if (account && !balanceCalled.current) {
      balanceCalled.current = true;
      fetchUSDTBalance();
    }
  }, [account]);

  const fetchUSDTBalance = async () => {
    if (!account?.address) return;
    try {
      const result = await balanceOf({ contract: usdtContract, address: account.address });
      const formatted = (Number(result) / 1e6).toFixed(2);
      localStorage.setItem("usdt_balance", formatted);
      setUsdtBalance(`${formatted} USDT`);
    } catch {
      setUsdtBalance("0.00 USDT");
    }
  };

  // ✅ 구독 유효성만 체크: pass_expired_at >= TODAY
  const checkMembership = async (wallet?: string) => {
    const w = (wallet || account?.address || "").toLowerCase();
    if (!w) {
      setHasMembership(false);
      setCurrentPass(null);
      setRefCode("");
      return;
    }

    try {
      // users에서 ref_code 조회
      const { data: user } = await supabase
        .from("users")
        .select("ref_code")
        .eq("wallet_address", w)
        .maybeSingle();

      const rc = user?.ref_code || "";
      setRefCode(rc);

      if (!rc) {
        setHasMembership(false);
        setCurrentPass(null);
        return;
      }

      // 오늘 기준 유효 구독 조회
      const today = new Date().toISOString().slice(0, 10);
      const { data: enrolls } = await supabase
        .from("enrollments")
        .select("pass_type, pass_expired_at")
        .eq("ref_code", rc)
        .gte("pass_expired_at", today)
        .order("pass_expired_at", { ascending: false })
        .limit(1);

      if (enrolls && enrolls.length > 0) {
        // pass_type은 TEXT로 저장됨 → 문자열로 처리
        const e = enrolls[0] as { pass_type: string; pass_expired_at: string };
        // 혹시 숫자만 들어오는 경우를 대비한 fallback
        const numericKey = parseInt(leadNum(e.pass_type) || "", 10);
        const title =
          (e.pass_type ?? "").toString().trim() ||
          (isFinite(numericKey) ? PASS_TITLE_BY_PRICE[numericKey] : "이모탈 멤버십");

        setHasMembership(true);
        setCurrentPass({ title, expiresAt: e.pass_expired_at });
      } else {
        setHasMembership(false);
        setCurrentPass(null);
      }
    } catch (err) {
      console.error("checkMembership error:", err);
      setHasMembership(false);
      setCurrentPass(null);
    }
  };

  // ✅ 초기 구독 상태 로드
  useEffect(() => {
    if (!account?.address) return;
    checkMembership(account.address);
  }, [account?.address]);

  // ✅ 구독 테이블 실시간 반영
  useEffect(() => {
    if (!refCode) return;
    const ch = supabase
      .channel("enrollments_realtime_store")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enrollments",
          filter: `ref_code=eq.${refCode}`,
        },
        () => {
          checkMembership(account?.address);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [refCode, account?.address]);

  const handlePassPurchased = async () => {
    if (!selectedPass || !address) return;
    setSelectedPass(null);
    // ✅ 결제(레코드 생성) 직후 유효성만 재확인
    await checkMembership(address);
  };

  return (
    <main className="w-full min-h-screen bg-[#f5f7fa] pt-0 pb-20">
      <TopBar title="스토어" />

      <div className="px-3 pt-2">
        <img src="/ad.png" alt="광고 배너" className="w-full rounded-xl shadow mb-2" />
      </div>

      {/* 안내 메시지 */}
      <div className="px-4 mt-4">
        <div className="bg-[#e9f1ff] border border-[#a3c7ff] text-sm text-gray-600 rounded-xl px-3 py-2 flex items-center gap-2">
          <img src="/deposit_tip.png" alt="입금 아이콘" className="w-10 h-10" />
          <span>
            멤버십을 구독 하기 전 하단의 나의 자산에서 <b>입금하기</b>를 클릭해 USDT를 충전해주세요.
            충전후 구독신청이 가능합니다.
          </span>
        </div>
      </div>

      <div className="max-w-[500px] mx-auto px-3 pt-2 space-y-2">
        {/* 내 자산 */}
        <section className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-blue-600 text-white text-md font-semibold px-4 py-1">나의 자산</div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <img src="/tether-icon.png" className="w-7 h-7" />
                <span className="font-semibold text-gray-600">Tether</span>
              </div>
              <span className="text-gray-900 font-bold text-base">{usdtBalance}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => router.push("/deposit")}
                className="w-1/2 py-2 rounded bg-blue-100 text-blue-600 font-semibold"
              >
                입금하기
              </button>
              <button
                onClick={() => router.push("/withdraw")}
                className="w-1/2 py-2 rounded bg-blue-100 text-blue-600 font-semibold"
              >
                출금하기
              </button>
            </div>
          </div>
        </section>

        {/* 현재 구독 요약 */}
        {hasMembership && currentPass && (
          <section className="bg-white rounded-xl shadow px-4 py-3">
            <h3 className="text-sm font-bold text-emerald-600 mb-2">내 구독</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-800">{currentPass.title}</span>
              <span className="text-gray-500">만료일: {currentPass.expiresAt}</span>
            </div>
          </section>
        )}

        {/* PASS 구입 섹션 */}
        <section className="bg-white rounded-xl shadow px-4 py-3">
          <h3 className="text-sm font-bold text-blue-500 mb-2">이모탈멤버십 구독하기</h3>

          {[
            { title: "100 USDT ", price: "1 USDT / 1개월", image: "/pass-300.png" },
            { title: "300 USDT", price: "300 USDT / 3개월 + 7일", image: "/pass-1800.png" },
            { title: "600 USDT", price: "600 USDT / 6개월 + 1개월", image: "/pass-3600.png" },
            { title: "1200 USDT", price: "1200 USDT / 12개월 + 3개월", image: "/pass-vip.png" },
          ].map((pass, idx) => {
            const priceNum = parseFloat(pass.price.replace("USDT", "").split("/")[0].trim());

            // ✅ 현재 활성 패스만 구독중으로 표시 (문자 정규화 + 숫자 비교)
            const isThisActive =
              !!currentPass &&
              (normalize(currentPass.title) === normalize(pass.title) ||
                leadNum(currentPass.title) === leadNum(pass.title));

            return (
              <div key={idx} className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <img src={pass.image} className="w-9 h-9" />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{pass.title}</p>
                    <p className="text-[12px] text-gray-500">{pass.price}</p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    setSelectedPass({
                      name: pass.title,
                      period: pass.price.split("/")[1].trim(),
                      price: priceNum,
                      image: pass.image,
                    })
                  }
                  disabled={isThisActive}
                  className={`text-[12px] font-semibold px-3 py-1 rounded-full ${
                    isThisActive
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-blue-500 text-white hover:bg-blue-600"
                  }`}
                >
                  {isThisActive ? "구독중" : "구독신청"}
                </button>
              </div>
            );
          })}
        </section>
      </div>

      {selectedPass && (
        <PassPurchaseModal
          selected={selectedPass}
          usdtBalance={parseFloat(usdtBalance.replace(" USDT", "")) || 0}
          onClose={() => setSelectedPass(null)}
          onPurchased={handlePassPurchased} // 결제 후 상태 새로고침
        />
      )}

      <BottomNav />
    </main>
  );
}
