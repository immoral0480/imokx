"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ShieldCheck } from "lucide-react";

// 정적 프리렌더 회피
export const dynamic = "force-dynamic";

function CoinWConnectInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const refCode = sp.get("ref") ?? "";

  const [name, setName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);

  // (선택) users 테이블에서 name, wallet_address 자동 채우기
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

  const disabled = loading || !refCode || !apiKey || !secretKey;

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();

    if (!refCode) {
      alert("초대코드(ref)가 없습니다. 이전 단계에서 다시 시도해주세요.");
      return;
    }
    if (!apiKey || !secretKey) {
      alert("API Key와 Secret Key를 모두 입력하세요.");
      return;
    }
    if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      alert("지갑 주소 형식이 올바르지 않습니다. (0x로 시작 42자)");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ref_code: refCode,
        name: name?.trim() || null,
        wallet_address: walletAddress?.trim() || null,
        api_key: apiKey.trim(),
        secret_key: secretKey.trim(),
        symbol: "XRPUSDT",
        entry_amount: 50,
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
          <h1 className="font-semibold text-gray-800">CoinW API 키 등록</h1>
        </div>

        {refCode ? (
          <p className="text-xs text-gray-500 mb-3">
            초대코드: <span className="font-medium">{refCode}</span>
          </p>
        ) : (
          <p className="text-xs text-red-600 mb-3">
            초대코드(ref) 파라미터가 없습니다. 이전 단계에서 다시 진입해주세요.
          </p>
        )}

        <form
          autoComplete="off"
          onSubmit={handleSave}
          className="space-y-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (선택)"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="cw-name"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

          <input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value.trim())}
            placeholder="지갑 주소 (0x...)"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="cw-wallet"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value.trim())}
            placeholder="API Key"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="cw-api-key"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

          <input
            type="text"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value.trim())}
            placeholder="Secret Key"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            name="cw-secret-key"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
          />

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

export default function CoinWConnectPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">로딩중…</div>}>
      <CoinWConnectInner />
    </Suspense>
  );
}
