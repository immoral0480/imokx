// src/components/BotSetupCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChevronRight } from "lucide-react";

type Props = {
  refCode: string;
  isBotRunning?: boolean;
  instId?: string;
  coinQty?: number;
  leverage?: number;
  onSaved?: (next: { instId: string; coinQty: number; leverage: number }) => void;
};

const MIN_LEV = 20;
const MAX_LEV = 50;

const DEFAULTS: Record<
  string,
  { coinQty: number; tp: number; sl: number; label: string }
> = {
  "BTC-USDT-SWAP": { coinQty: 0.001, tp: 800, sl: 240, label: "BTC-USDT-SWAP" },
  "ETH-USDT-SWAP": { coinQty: 0.01, tp: 36, sl: 12, label: "ETH-USDT-SWAP" },
  "SOL-USDT-SWAP": { coinQty: 1, tp: 3.2, sl: 1.2, label: "SOL-USDT-SWAP" },
  "XRP-USDT-SWAP": { coinQty: 50, tp: 0.03, sl: 0.012, label: "XRP-USDT-SWAP" },
};

export default function BotSetupCard({
  refCode,
  isBotRunning = false,
  instId,
  coinQty,
  leverage,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inst, setInst] = useState(instId ?? "XRP-USDT-SWAP");
  const [qty, setQty] = useState<string>(
    coinQty !== undefined ? String(coinQty) : String(DEFAULTS["XRP-USDT-SWAP"].coinQty)
  );
  const [lev, setLev] = useState<number>(leverage ?? 20);
  const [loading, setLoading] = useState(false);
  const [savingInst, setSavingInst] = useState(false);

  useEffect(() => {
    if (!refCode) return;
    if (instId !== undefined || coinQty !== undefined || leverage !== undefined) return;

    (async () => {
      const { data, error } = await supabase
        .from("bot_settings")
        .select("inst_id, coin_qty, coin_qty, leverage")
        .eq("ref_code", refCode)
        .maybeSingle();

      if (!error && data) {
        const i = (data.inst_id as string) ?? "XRP-USDT-SWAP";
        setInst(i);
        const d = DEFAULTS[i] ?? DEFAULTS["XRP-USDT-SWAP"];
        const initQty =
          (typeof data.coin_qty === "number" && data.coin_qty > 0
            ? data.coin_qty
            : typeof data.coin_qty === "number" && data.coin_qty > 0
            ? data.coin_qty
            : d.coinQty);
        setQty(String(initQty));
        setLev(
          Number.isFinite(data.leverage) && data.leverage >= MIN_LEV && data.leverage <= MAX_LEV
            ? Number(data.leverage)
            : 20
        );
      }
    })();
  }, [refCode, instId, coinQty, leverage]);

  async function handleInstChange(next: string) {
    setInst(next);
    const d = DEFAULTS[next] ?? DEFAULTS["XRP-USDT-SWAP"];
    setQty(String(d.coinQty));

    if (!refCode) return;
    try {
      setSavingInst(true);
      const { error } = await supabase
        .from("bot_settings")
        .upsert(
          {
            ref_code: refCode,
            inst_id: next,
            tp_diff: d.tp,
            sl_diff: d.sl,
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

  const qtyNum = Number(qty);
  const qtyInvalid = isNaN(qtyNum) || qtyNum <= 0;
  const levInvalid = lev < MIN_LEV || lev > MAX_LEV || !Number.isInteger(lev);

  const summary = useMemo(
    () =>
      `${DEFAULTS[inst]?.label ?? inst} / 코인수량 ${qty} / 레버리지 x${lev}` +
      (savingInst ? " (인스트 저장 중...)" : ""),
    [inst, qty, lev, savingInst]
  );

  async function handleSave() {
    if (!refCode) return;
    if (qtyInvalid) {
      alert("❗ 코인 수량은 0보다 큰 숫자로 입력하세요.");
      return;
    }
    if (levInvalid) {
      alert(`❗ 레버리지는 ${MIN_LEV}~${MAX_LEV} 사이의 정수만 가능합니다.`);
      return;
    }

    const nQty = Number(qty);

    setLoading(true);
    const { error } = await supabase
      .from("bot_settings")
      .upsert(
        {
          ref_code: refCode,
          inst_id: inst,
          coin_qty: nQty,
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

    onSaved?.({ instId: inst, coinQty: nQty, leverage: Math.trunc(lev) });
    alert("✅ 세팅 저장 완료");
    setOpen(false);
  }

  const cardDisabled = isBotRunning;

  return (
    <>
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
                인스트 변경 시 기본 TP/SL 및 포지션모드가 <b>자동 저장</b>됩니다.
              </p>
            </div>

            {/* 코인 수량 */}
            <div>
              <label className="block text-sm font-medium mb-1">진입 코인 수량</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                min={0}
                step="any"
                className="w-full border rounded px-3 py-2 text-sm"
              />
              {qtyInvalid && <p className="text-[11px] text-red-500 mt-1">0보다 큰 숫자를 입력하세요.</p>}
              <p className="text-[11px] text-gray-500 mt-1">거래소 최소수량은 백엔드에서 자동 보정됩니다.</p>
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
