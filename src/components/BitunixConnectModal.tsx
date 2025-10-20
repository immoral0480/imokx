"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  refCode: string;
  onClose: () => void;
  onConnect: (apiKey: string, apiSecret: string) => void;
}

export default function CoinwConnectModal({ refCode, onClose, onConnect }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);

  const [userInfo, setUserInfo] = useState<{
    name: string;
    wallet_address: string;
  } | null>(null);

  // ✅ 유저 정보 로딩
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!refCode) return;

      const { data: user, error } = await supabase
        .from("users")
        .select("name, wallet_address")
        .eq("ref_code", refCode)
        .maybeSingle();

      if (error) {
        console.error("❌ 유저 정보 로딩 실패:", error.message);
        return;
      }

      setUserInfo(user || null);
    };

    fetchUserInfo();
  }, [refCode]);

  // ✅ 기존 API 키 불러오기
  useEffect(() => {
    const fetchKeys = async () => {
      if (!refCode) return;

      const { data, error } = await supabase
        .from("users")
        .select("api_key, secret_key")
        .eq("ref_code", refCode)
        .eq("symbol", "XRP") // 기본값 symbol
        .maybeSingle();

      if (!error && data) {
        setApiKey(data.api_key || "");
        setApiSecret(data.secret_key || "");
      }
    };

    fetchKeys();
  }, [refCode]);

  // ✅ 저장 및 연결
  const handleConnect = async () => {
    if (!apiKey || !apiSecret) {
      alert("API 키와 시크릿을 모두 입력해주세요.");
      return;
    }

    if (!refCode) {
      alert("❌ refCode가 없습니다.");
      return;
    }

    setLoading(true);

    const symbol = "XRP"; // 기본 심볼

    const { error } = await (
      supabase
        .from("users")
        .upsert(
          {
            ref_code: refCode,
            symbol,
            api_key: apiKey,
            secret_key: apiSecret,
            name: userInfo?.name || "",
            wallet_address: userInfo?.wallet_address || "",
            updated_at: new Date().toISOString(),
          } as any,
          {
            onConflict: ["ref_code", "symbol"],
          } as any
        )
    );

    setLoading(false);

    if (error) {
      alert("❌ 저장 실패: " + error.message);
    } else {
      alert("✅ 저장 및 연결 완료");
      onConnect(apiKey, apiSecret);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white rounded-xl p-6 w-[90%] max-w-md shadow-lg">
        <h2 className="text-lg font-bold mb-4">coinw API 연결</h2>

        <input
          type="text"
          placeholder="API 키"
          className="w-full border rounded px-3 py-2 mb-3"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <input
          type="text"
          placeholder="API 시크릿"
          className="w-full border rounded px-3 py-2 mb-5"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded"
            disabled={loading}
          >
            취소
          </button>
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-blue-600 text-white rounded"
            disabled={loading}
          >
            {loading ? "저장 중..." : "저장 및 연결"}
          </button>
        </div>
      </div>
    </div>
  );
}
