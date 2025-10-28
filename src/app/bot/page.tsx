// src/app/bot/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useActiveAccount } from "thirdweb/react";
import PassCard from "@/components/PassCard";
import { getKSTDateString } from "@/lib/dateUtil";

// 카드 컴포넌트
import OkxApiCard from "@/components/CoinWApiCard";          // ✅ 변경: CoinW → OKX
import BotSetupCard from "@/components/BotSetupCard";       // ✅ 이 컴포넌트는 앞서 inst_id/entry_qty로 수정한 버전
import BotControlCard from "@/components/BotControlCard";   // ✅ 이 컴포넌트도 instId/entryQty로 수정한 버전
import BotStatusCard from "@/components/BotStatusCard";
import BotLogCard from "@/components/BotLogCard";

type BotStatus = "running" | "stopped" | "unknown";

export default function BotPage() {
  // ===== 입력값/설정 =====
  const [instId, setInstId] = useState("XRP-USDT-SWAP");  // ✅ 기본 인스트루먼트
  const [entryQty, setEntryQty] = useState("1");          // ✅ 계약 수(문자열 상태로 보관 → 저장 시 정수 변환)

  // ===== API (OKX) =====
  const [okxApiKey, setOkxApiKey] = useState("");
  const [okxApiSecret, setOkxApiSecret] = useState("");
  const [okxApiPassphrase, setOkxApiPassphrase] = useState("");

  // ===== 유저/상태 =====
  const account = useActiveAccount();
  const [refCode, setRefCode] = useState("");
  const [name, setName] = useState("");
  const [botStatus, setBotStatus] = useState<BotStatus>("unknown");
  const isBotRunning = botStatus === "running";
  const [hasMembership, setHasMembership] = useState(false);

  // 주소는 변수로 추출(타입 안정)
  const walletAddress = useMemo(
    () => (account?.address ? account.address.toLowerCase() : ""),
    [account?.address]
  );

  // 멤버십 확인
  const checkMembership = useCallback(async () => {
    if (!refCode) {
      setHasMembership(false);
      return;
    }
    try {
      const todayKst = getKSTDateString();
      const { data, error } = await supabase
        .from("enrollments")
        .select("id")
        .eq("ref_code", refCode)
        .ilike("memo", "%결제 완료%")
        .gte("pass_expired_at", todayKst)
        .limit(1);

      setHasMembership(!error && !!data && data.length > 0);
    } catch {
      setHasMembership(false);
    }
  }, [refCode]);

  // 초기 로드: refCode/기본 세팅/키 로드
  useEffect(() => {
    if (!walletAddress) return;

    (async () => {
      const { data: userRow } = await supabase
        .from("users")
        .select("ref_code, name")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      if (!userRow?.ref_code) return;

      setRefCode(userRow.ref_code);
      setName(userRow.name ?? "");

      const { data: botRow } = await supabase
        .from("bot_settings")
        .select("inst_id, entry_qty, okx_api_key, okx_api_secret, okx_api_passphrase, enabled")
        .eq("ref_code", userRow.ref_code)
        .maybeSingle();

      if (botRow) {
        setInstId(botRow.inst_id || "XRP-USDT-SWAP");
        setEntryQty(String(botRow.entry_qty ?? "1"));
        setOkxApiKey(botRow.okx_api_key ?? "");
        setOkxApiSecret(botRow.okx_api_secret ?? "");
        setOkxApiPassphrase(botRow.okx_api_passphrase ?? "");
        setBotStatus(botRow.enabled ? "running" : "stopped");
      } else {
        setBotStatus("stopped");
      }
    })();
  }, [walletAddress]);

  // refCode 준비되면 멤버십 1회 확인
  useEffect(() => {
    if (!refCode) return;
    checkMembership();
  }, [refCode, checkMembership]);

  // 실시간 구독: enabled (예전 is_running 대체)
  useEffect(() => {
    if (!refCode) return;

    const ch = supabase
      .channel("rt_bot_settings_enabled")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bot_settings",
          filter: `ref_code=eq.${refCode}`,
        },
        (payload) => {
          const next = (payload.new as any)?.enabled;
          if (typeof next === "boolean") {
            setBotStatus(next ? "running" : "stopped");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch).catch(() => {});
    };
  }, [refCode]);

  // 실시간 구독: 멤버십
  useEffect(() => {
    if (!refCode) return;

    const ch = supabase
      .channel("rt_enrollments_for_botpage")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enrollments",
          filter: `ref_code=eq.${refCode}`,
        },
        () => {
          checkMembership();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch).catch(() => {});
    };
  }, [refCode, checkMembership]);

  // 탭 복귀 시 멤버십 재확인
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkMembership();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkMembership]);

  // OKX API 3종이 모두 있어야 true
  const hasApi = !!okxApiKey && !!okxApiSecret && !!okxApiPassphrase;

  return (
    <>
      <main className="min-h-screen bg-[#f5f7fa] pb-24">
        <TopBar title="이모탈봇" />
        <div className="px-4 pt-4 space-y-3">
          {/* 배너 */}
          <div className="w-full h-[100px] relative overflow-hidden rounded-xl">
            <Image
              src="/ad.png"
              alt="이모탈 배너"
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          </div>

          {refCode && <PassCard refCode={refCode} />}

          {/* API 연동 카드 (OKX) */}
          {refCode && <OkxApiCard refCode={refCode} />}

          {/* 봇 세팅 카드 */}
          {refCode && (
            <BotSetupCard
              refCode={refCode}
              isBotRunning={isBotRunning}
              instId={instId}
              entryQty={Number(entryQty)}
              onSaved={({ instId: nextInst, entryQty: nextQty }) => {
                setInstId(nextInst);
                setEntryQty(String(nextQty));
              }}
            />
          )}

          {/* 시작/중지 컨트롤 */}
          {refCode && (
            <BotControlCard
              refCode={refCode}
              isBotRunning={isBotRunning}
              instId={instId}
              entryQty={entryQty}
              hasApi={hasApi}
              onRunningChange={(running) => setBotStatus(running ? "running" : "stopped")}
            />
          )}

          {/* 실행 현황/로그 */}
          {refCode && <BotStatusCard refCode={refCode} />}
          {refCode && <BotLogCard refCode={refCode} />}
        </div>
      </main>

      <BottomNav />
    </>
  );
}
