// src/components/BotSetupCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChevronRight } from "lucide-react";

type Props = {
  refCode: string;
  isBotRunning?: boolean;
  instId?: string;              // ✅ 변경: symbol -> instId
  entryQty?: number;            // ✅ 변경: entryAmount -> entryQty (정수)
  leverage?: number;
  onSaved?: (next: { instId: string; entryQty: number; leverage: number }) => void;
};

const MIN_LEV = 20;
const MAX_LEV = 50;

/** OKX SWAP 인스트루먼트 기본값들
 *  - entryQty: 계약 수(정수). 거래소 lot/minSz는 백엔드에서 보정.
 *  - tp/sl: 절대가격 차이(OKX 봇의 TP_DIFF/SL_DIFF) — 화면에는 노출하지 않지만 inst 변경 시 자동 저장.
 */
const DEFAULTS: Record<
  string,
  { entryQty: number; tp: number; sl: number; label: string }
> = {
  "BTC-USDT-SWAP": { entryQty: 1, tp: 800,  sl: 240,  label: "BTC-USDT-SWAP" },
  "ETH-USDT-SWAP": { entryQty: 1, tp: 36,   sl: 12,   label: "ETH-USDT-SWAP" },
  "SOL-USDT-SWAP": { entryQty: 1, tp: 3.2,  sl: 1.2,  label: "SOL-USDT-SWAP" },
  "XRP-USDT-SWAP": { entryQty: 1, tp: 0.03, sl: 0.012, label: "XRP-USDT-SWAP" },
};

export default function BotSetupCard({
  refCode,
  isBotRunning = false,
  instId,
  entryQty,
  leverage,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);

  const [inst, setInst] = useState(instId ?? "XRP-USDT-SWAP");
  const [qty, setQty] = useState<string>(
    entryQty !== undefined ? String(entryQty) : String(DEFAULTS["XRP-USDT-SWAP"].entryQty)
  );
  const [lev, setLev] = useState<number>(leverage ?? 20);
  const [loading, setLoading] = useState(false);
  const [savingInst, setSavingInst] = useState(false); // 인스트 변경 자동 저장 표시

  // 서버에서 기존 설정 로드(부모 프롭이 없을 때)
  useEffect(() => {
    if (!refCode) return;
    if (instId !== undefined || entryQty !== undefined || leverage !== undefined) return;

    (async () => {
      // 조회는 민감정보 없는 view를 쓰는 걸 권장 (bot_settings_public)
      const { data, error } = await supabase
        .from("bot_settings") // 필요 시 "bot_settings_public"로 교체
        .select("inst_id, entry_qty, leverage")
        .eq("ref_code", refCode)
        .maybeSingle();

      if (!error && data) {
        const i = (data.inst_id as string) ?? "XRP-USDT-SWAP";
        setInst(i);
        const d = DEFAULTS[i] ?? DEFAULTS["XRP-USDT-SWAP"];
        setQty(String(data.entry_qty ?? d.entryQty));
        setLev(
          Number.isFinite(data.leverage) && data.leverage >= MIN_LEV && data.leverage <= MAX_LEV
            ? Number(data.leverage)
            : 20
        );
      }
    })();
  }, [refCode, instId, entryQty, leverage]);

  // 인스트루먼트 변경 → 기본 수량 채우고, TP/SL 즉시 자동 저장(화면엔 표시 안 함)
  async function handleInstChange(next: string) {
    setInst(next);
    const d = DEFAULTS[next] ?? DEFAULTS["XRP-USDT-SWAP"];
    setQty(String(d.entryQty));

    if (!refCode) return;
    try {
      setSavingInst(true);
      const { error } = await supabase
        .from("bot_settings")
        .upsert(
          {
            ref_code: refCode,
            inst_id: next,
            tp_diff: d.tp,            // ✅ 자동 저장 (OKX 봇 TP_DIFF)
            sl_diff: d.sl,            // ✅ 자동 저장 (OKX 봇 SL_DIFF)
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ref_code" }
        );
      if (error) throw error;
    } catch (e) {
      console.error("인스트 변경 자동 저장 실패:", e);
      alert("❌ 인스트 변경 자동 저장 실패");
    } finally {
      setSavingInst(false);
    }
  }

  function handleLeverageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    if (!isNaN(v)) setLev(v);
  }

  const levInvalid = lev < MIN_LEV || lev > MAX_LEV || !Number.isInteger(lev);
  const qtyInvalid = isNaN(Number(qty)) || Number(qty) <= 0 || !Number.isInteger(Number(qty));

  const summary = useMemo(
    () =>
      `${DEFAULTS[inst]?.label ?? inst} / 계약수 ${qty} / 레버리지 x${lev}` +
      (savingInst ? " (인스트 저장 중...)" : ""),
    [inst, qty, lev, savingInst]
  );

  // 저장: entry_qty + leverage (inst는 선택 즉시 저장되므로 재기입만)
  async function handleSave() {
    if (!refCode) return;

    if (qtyInvalid) {
      alert("❗ 계약 수는 1 이상의 정수로 입력하세요.");
      return;
    }
    if (levInvalid) {
      alert(`❗ 레버리지는 ${MIN_LEV}~${MAX_LEV} 사이의 정수만 가능합니다.`);
      return;
    }

    const nQty = Math.trunc(Number(qty));

    setLoading(true);
    const { error } = await supabase
      .from("bot_settings")
      .upsert(
        {
          ref_code: refCode,
          inst_id: inst,            // 재기입(안전)
          entry_qty: nQty,          // ✅ 테이블 스키마 반영
          leverage: Math.trunc(lev),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ref_code" }
      );
    setLoading(false);

    if (error) {
      console.error("세팅 저장 실패:", error.message);
      alert("❌ 세팅 저장 실패");
      return;
    }

    onSaved?.({ instId: inst, entryQty: nQty, leverage: Math.trunc(lev) });
    alert("✅ 세팅 저장 완료");
    setOpen(false);
  }

  const cardDisabled = isBotRunning;

  return (
    <>
      {/* 카드 */}
      <div
        onClick={() => !cardDisabled && setOpen(true)}
        className={`bg-white border rounded-xl px-4 py-3 flex items-center justify-between
        ${cardDisabled ? "opacity-50 pointer-events-none border-gray-200" : "cursor-pointer border-gray-200"}`}
      >
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-800">봇 세팅하기</span>
          <span className="text-xs text-gray-500">{summary}</span>
        </div>
        <ChevronRight className="text-gray-400" />
      </div>

      {/* 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl w-[90%] max-w-md p-6 space-y-4 shadow-lg">
            <h2 className="text-lg font-bold">봇 세팅</h2>

            {/* 인스트루먼트 */}
            <div>
              <label className="block text-sm font-medium mb-1">거래 인스트루먼트</label>
              <select
                value={inst}
                onChange={(e) => handleInstChange(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                disabled={savingInst}
              >
                <option value="BTC-USDT-SWAP">BTC-USDT-SWAP</option>
                <option value="ETH-USDT-SWAP">ETH-USDT-SWAP</option>
                <option value="SOL-USDT-SWAP">SOL-USDT-SWAP</option>
                <option value="XRP-USDT-SWAP">XRP-USDT-SWAP</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                인스트 변경 시 해당 기본 TP/SL이 <b>자동 저장</b>됩니다. (화면에는 표시하지 않음)
              </p>
            </div>

            {/* 계약 수(entry_qty) */}
            <div>
              <label className="block text-sm font-medium mb-1">진입 계약 수 (entry_qty)</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                min={1}
                step={1}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              {qtyInvalid && (
                <p className="text-[11px] text-red-500 mt-1">1 이상의 정수를 입력하세요.</p>
              )}
            </div>

            {/* 레버리지 */}
            <div>
              <label className="block text-sm font-medium mb-1">레버리지 (배수)</label>
              <input
                type="number"
                value={lev}
                onChange={handleLeverageChange}
                min={MIN_LEV}
                max={MAX_LEV}
                step={1}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                {MIN_LEV}~{MAX_LEV}배 범위에서 1단위로 설정됩니다.
              </p>
              {levInvalid && (
                <p className="text-[11px] text-red-500 mt-1">
                  레버리지는 {MIN_LEV}~{MAX_LEV} 사이 정수여야 합니다.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="px-4 py-2 bg-gray-200 rounded">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={loading || levInvalid || qtyInvalid || savingInst}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
              >
                {loading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
