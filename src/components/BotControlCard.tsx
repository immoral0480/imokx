// src/components/BotControlCard.tsx
"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { startBot, stopBot } from "@/lib/botApi";
import { PauseCircle, PlayCircle } from "lucide-react";

type Props = {
  refCode: string;
  isBotRunning: boolean;
  symbol: string;
  entryAmount: string | number;
  hasApi: boolean; // coinw api key/secret 존재 여부
  onRunningChange?: (running: boolean) => void; // 실행/중지 후 부모 갱신
};

export default function BotControlCard({
  refCode,
  isBotRunning,
  symbol,
  entryAmount,
  hasApi,
  onRunningChange,
}: Props) {
  const [showStartModal, setShowStartModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const amtNum = useMemo(() => parseFloat(String(entryAmount)), [entryAmount]);
  const statusLabel = isBotRunning ? "실행 중" : "중지됨";
  const statusPill = isBotRunning ? "RUNNING" : "STOPPED";

  async function doStart() {
    if (!refCode) return;
    if (!hasApi) {
      alert("❗ 먼저 COINW API를 저장해주세요.");
      return;
    }
    if (!symbol || isNaN(amtNum) || amtNum <= 0) {
      alert("❗ 봇 세팅(심볼/수량)을 먼저 저장해주세요.");
      return;
    }

    setBusy(true);
    try {
      await supabase
        .from("bot_settings")
        .upsert(
          { ref_code: refCode, is_running: true, updated_at: new Date().toISOString() },
          { onConflict: "ref_code" }
        );
      onRunningChange?.(true);
      startBot(refCode).catch((e) => console.warn("startBot error:", e));
      alert("🚀 봇 실행 시작됨");
    } catch (e: any) {
      console.error(e);
      alert("❌ 시작 실패");
    } finally {
      setBusy(false);
      setShowStartModal(false);
    }
  }

  async function doStop() {
    if (!refCode) return;

    setBusy(true);
    try {
      await supabase
        .from("bot_settings")
        .upsert(
          { ref_code: refCode, is_running: false, updated_at: new Date().toISOString() },
          { onConflict: "ref_code" }
        );
      onRunningChange?.(false);
      stopBot(refCode).catch((e) => console.warn("stopBot error:", e));
      alert("🛑 봇 중지 완료");
    } catch (e: any) {
      console.error(e);
      alert("❌ 중지 실패");
    } finally {
      setBusy(false);
      setShowStopModal(false);
    }
  }

  return (
    <>
      {/* 시작하기 버튼 */}
      <button
        onClick={() => setShowStartModal(true)}
        className="w-full py-3 rounded-full bg-[#377DFF] text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
        disabled={!refCode || busy}
      >
        시작하기
      </button>

      {/* 중지하기 버튼 */}
      <button
        onClick={() => setShowStopModal(true)}
        className="w-full py-3 rounded-full border border-[#377DFF] text-[#377DFF] text-sm font-semibold hover:bg-blue-50 transition disabled:opacity-60"
        disabled={!refCode || busy}
      >
        중지하기
      </button>

      {/* 시작 모달 */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl w-[90%] max-w-md p-6 space-y-6 shadow-lg">
            <h2 className="text-lg font-bold text-center">프라봇을 시작합니다</h2>
            <div className="text-sm text-gray-800 space-y-2">
              <p>
                <span className="font-medium">거래심볼:</span> {symbol}
              </p>
              <p>
                <span className="font-medium">진입금액:</span> {entryAmount}
              </p>
              <p className="text-xs text-gray-500">나의 자산규모에 맞는 진입금액인지 확인해주세요</p>
            </div>
            <div className="flex justify-between gap-4 pt-2">
              <button
                onClick={() => setShowStartModal(false)}
                className="w-full py-2 rounded-md bg-gray-200 text-sm font-medium hover:bg-gray-300"
                disabled={busy}
              >
                취소
              </button>
              <button
                onClick={doStart}
                className="w-full py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                disabled={busy}
              >
                시작하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 중지 모달 */}
      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl w-[90%] max-w-md p-6 space-y-6 shadow-lg">
            <h2 className="text-lg font-bold text-center">스노봇을 중지합니다</h2>
            <div className="p-4 rounded-lg border border-gray-300 bg-gray-50">
              <p className="text-sm font-semibold mb-1">현재 포지션은 유지할게요</p>
              <p className="text-xs text-gray-500">봇은 중지되지만 현재 모든 포지션은 유지됩니다</p>
            </div>
            <div className="flex justify-between gap-4 pt-2">
              <button
                onClick={() => setShowStopModal(false)}
                className="w-full py-2 rounded-md bg-gray-200 text-sm font-medium hover:bg-gray-300"
                disabled={busy}
              >
                취소
              </button>
              <button
                onClick={doStop}
                className="w-full py-2 rounded-md bg-[#377DFF] text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
                disabled={busy}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
