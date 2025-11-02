// src/app/okx-connect/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

// 코인별 TP/SL 프리셋
const PRESET: Record<string, { tp: number; sl: number }> = {
  "BTC-USDT-SWAP": { tp: 800, sl: 600 },
  "ETH-USDT-SWAP": { tp: 36, sl: 12 },
  "SOL-USDT-SWAP": { tp: 3, sl: 1.2 },
  "XRP-USDT-SWAP": { tp: 0.03, sl: 0.012 },
};

function OkxConnectInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const refCode = sp.get("ref") ?? "";

  // (선택 표시용)
  const [name, setName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

  // OKX API 입력
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  // 기본 저장 옵션
  const [instId, setInstId] = useState<keyof typeof PRESET>("XRP-USDT-SWAP");
  const [coinQty, setcoinQty] = useState(1); // 코인 수(정수)

  // 선택된 코인에 따른 자동 TP/SL (UI 비노출)
  const preset = useMemo(() => PRESET[instId] ?? PRESET["XRP-USDT-SWAP"], [instId]);

  const [loading, setLoading] = useState(false);

  // (선택) users에서 이름/지갑 표시만
  useEffect(() => {
    if (!refCode) return;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("name, wallet_address")
        .eq("ref_code", refCode)
        .maybeSingle();
      if (data?.name) setName((prev) => prev || data.name);
      if (data?.wallet_address) setWalletAddress((prev) => prev || data.wallet_address);
    })();
  }, [refCode]);

  const disabled =
    loading || !refCode || !apiKey || !secretKey || !passphrase || !Number.isInteger(coinQty) || coinQty <= 0;

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();

    if (!refCode) {
      alert("초대코드(ref)가 없습니다. 이전 단계에서 다시 시도해주세요.");
      return;
    }
    if (!apiKey || !secretKey || !passphrase) {
      alert("OKX API Key / Secret / Passphrase를 모두 입력하세요.");
      return;
    }
    if (!Number.isInteger(coinQty) || coinQty <= 0) {
      alert("진입 코인 수(coin_qty)는 1 이상의 정수여야 합니다.");
      return;
    }
    if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      alert("지갑 주소 형식이 올바르지 않습니다. (0x로 시작 42자)");
      return;
    }

    setLoading(true);
    try {
      // ✅ tp_diff / sl_diff는 코인 프리셋으로 자동 저장
      const payload = {
        ref_code: refCode,
        inst_id: instId,
        coin_qty: coinQty,
        okx_api_key: apiKey.trim(),
        okx_api_secret: secretKey.trim(),
        okx_api_passphrase: passphrase.trim(),
        tp_diff: preset.tp,
        sl_diff: preset.sl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("bot_settings")
        .upsert(payload, { onConflict: "ref_code", ignoreDuplicates: false });

      if (error) {
        alert("저장 실패: " + error.message);
        return;
      }

      alert("저장 완료!");
      router.replace(`/bot?ref=${encodeURIComponent(refCode)}`);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-md rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h1 className="font-semibold text-gray-800">OKX API 키 등록</h1>
        </div>

        {refCode ? (
          <p className="text-xs text-gray-500 mb-3">
            초대코드: <span className="font-medium">{refCode}</span>
          </p>
        ) : (
          <p className="text-xs text-red-600 mb-3">초대코드(ref) 파라미터가 없습니다. 이전 단계에서 다시 진입해주세요.</p>
        )}

        {/* 표시만 */}
        <div className="text-xs text-gray-500 mb-4 space-y-1">
          {name && (
            <p>
              이름: <span className="font-medium">{name}</span>
            </p>
          )}
          {walletAddress && (
            <p>
              지갑: <span className="font-mono">{walletAddress}</span>
            </p>
          )}
        </div>

        <form autoComplete="off" onSubmit={handleSave} className="space-y-3">
          {/* OKX API 입력 */}
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="OKX API Key"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="okx-api-key"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

          <input
            type="text"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="OKX Secret Key"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="okx-secret-key"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

          <input
            type="text"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="OKX Passphrase"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="okx-passphrase"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

          {/* 기본 설정 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">인스트루먼트</label>
              <select
                value={instId}
                onChange={(e) => setInstId(e.target.value as keyof typeof PRESET)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="BTC-USDT-SWAP">BTC-USDT-SWAP</option>
                <option value="ETH-USDT-SWAP">ETH-USDT-SWAP</option>
                <option value="SOL-USDT-SWAP">SOL-USDT-SWAP</option>
                <option value="XRP-USDT-SWAP">XRP-USDT-SWAP</option>
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                선택한 코인에 따라 익절/손절 값이 자동 적용됩니다. (예: BTC 800/600, ETH 36/12, SOL 3/1.2, XRP 0.03/0.012)
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">진입 코인 수 (coin_qty)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={coinQty}
                onChange={(e) => setcoinQty(Number(e.target.value || 1))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="mt-2 w-full py-2 bg-blue-600 text-white font-semibold rounded-lg
                       hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "저장 중..." : "저장하기"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OkxConnectPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">로딩중…</div>}>
      <OkxConnectInner />
    </Suspense>
  );
}
