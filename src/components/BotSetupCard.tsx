// src/components/BotSetupCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChevronRight } from "lucide-react";

type Props = {
  refCode: string;
  isBotRunning?: boolean;
  symbol?: string;
  entryAmount?: string | number;
  leverage?: number;
  onSaved?: (next: { symbol: string; entryAmount: number; leverage: number }) => void;
};

const MIN_LEV = 20;
const MAX_LEV = 50;

// 심볼별 기본값(수량/TP/SL) — TP/SL은 화면에 안 보이지만 자동 저장에 사용됨
const DEFAULTS: Record<string, { amount: number; tp: number; sl: number; label: string }> = {
  BTCUSDT: { amount: 0.001, tp: 800,  sl: 240,  label: "BTC/USDT" },
  ETHUSDT: { amount: 0.03,  tp: 36,   sl: 12,   label: "ETH/USDT" },
  SOLUSDT: { amount: 0.5,   tp: 3.2,  sl: 1.2,  label: "SOL/USDT" },
  XRPUSDT: { amount: 50,    tp: 0.03, sl: 0.012, label: "XRP/USDT" },
};

// 심볼별 수량 입력 step (UX)
const AMOUNT_STEP: Record<string, number> = {
  BTCUSDT: 0.0001,
  ETHUSDT: 0.001,
  SOLUSDT: 0.01,
  XRPUSDT: 1,
};

export default function BotSetupCard({
  refCode,
  isBotRunning = false,
  symbol,
  entryAmount,
  leverage,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);

  const [sym, setSym] = useState(symbol ?? "XRPUSDT");
  const [amount, setAmount] = useState<string>(
    entryAmount !== undefined ? String(entryAmount) : String(DEFAULTS["XRPUSDT"].amount)
  );
  const [lev, setLev] = useState<number>(leverage ?? 20);
  const [loading, setLoading] = useState(false);
  const [savingSymbol, setSavingSymbol] = useState(false); // 심볼 변경 자동 저장 표시

  // 서버에서 기존 설정 로드(부모 프롭이 없을 때)
  useEffect(() => {
    if (!refCode) return;
    if (symbol !== undefined || entryAmount !== undefined || leverage !== undefined) return;

    (async () => {
      const { data, error } = await supabase
        .from("bot_settings")
        .select("symbol, entry_amount, leverage")
        .eq("ref_code", refCode)
        .maybeSingle();

      if (!error && data) {
        const s = (data.symbol as string) ?? "XRPUSDT";
        setSym(s);
        const d = DEFAULTS[s] ?? DEFAULTS["XRPUSDT"];
        setAmount(String(data.entry_amount ?? d.amount));
        setLev(
          Number.isFinite(data.leverage) && data.leverage >= MIN_LEV && data.leverage <= MAX_LEV
            ? Number(data.leverage)
            : 20
        );
      }
    })();
  }, [refCode, symbol, entryAmount, leverage]);

  // 심볼 변경 → 기본 수량 채우고, TP/SL은 즉시 Supabase 자동 저장(화면엔 표시 안 함)
  async function handleSymbolChange(next: string) {
    setSym(next);
    const d = DEFAULTS[next] ?? DEFAULTS["XRPUSDT"];
    setAmount(String(d.amount));

    if (!refCode) return;
    try {
      setSavingSymbol(true);
      const { error } = await supabase
        .from("bot_settings")
        .upsert(
          {
            ref_code: refCode,
            symbol: next,
            tp_diff: d.tp,         // 자동 저장
            sl_diff: d.sl,         // 자동 저장
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ref_code" }
        );
      if (error) throw error;
    } catch (e) {
      console.error("심볼 변경 자동 저장 실패:", e);
      alert("❌ 심볼 변경 자동 저장 실패");
    } finally {
      setSavingSymbol(false);
    }
  }

  function handleLeverageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    if (!isNaN(v)) setLev(v);
  }

  const levInvalid = lev < MIN_LEV || lev > MAX_LEV || !Number.isInteger(lev);
  const amountInvalid = isNaN(Number(amount)) || Number(amount) <= 0;

  const summary = useMemo(
    () =>
      `${DEFAULTS[sym]?.label ?? sym} / 수량 ${amount} / 레버리지 x${lev}` +
      (savingSymbol ? " (심볼 저장 중...)" : ""),
    [sym, amount, lev, savingSymbol]
  );

  // 저장: 수량 + 레버리지만
  async function handleSave() {
    if (!refCode) return;

    if (amountInvalid) {
      alert("❗ 유효한 수량을 입력하세요.");
      return;
    }
    if (levInvalid) {
      alert(`❗ 레버리지는 ${MIN_LEV}~${MAX_LEV} 사이의 정수만 가능합니다.`);
      return;
    }

    const nAmount = Number(amount);

    setLoading(true);
    const { error } = await supabase
      .from("bot_settings")
      .upsert(
        {
          ref_code: refCode,
          symbol: sym,               // 재기입(안전)
          entry_amount: nAmount,
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

    onSaved?.({ symbol: sym, entryAmount: nAmount, leverage: Math.trunc(lev) });
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

            {/* 거래 심볼 */}
            <div>
              <label className="block text-sm font-medium mb-1">거래 심볼</label>
              <select
                value={sym}
                onChange={(e) => handleSymbolChange(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                disabled={savingSymbol}
              >
                <option value="BTCUSDT">BTC/USDT</option>
                <option value="ETHUSDT">ETH/USDT</option>
                <option value="SOLUSDT">SOL/USDT</option>
                <option value="XRPUSDT">XRP/USDT</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                심볼 변경 시 해당 심볼의 TP/SL이 <b>자동 저장</b>됩니다. (화면에는 표시하지 않음)
              </p>
            </div>

            {/* 수량 */}
            <div>
              <label className="block text-sm font-medium mb-1">진입 금액(코인 수량)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step={AMOUNT_STEP[sym] ?? 0.0001}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              {amountInvalid && (
                <p className="text-[11px] text-red-500 mt-1">0보다 큰 수를 입력하세요.</p>
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
                disabled={loading || levInvalid || amountInvalid || savingSymbol}
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
