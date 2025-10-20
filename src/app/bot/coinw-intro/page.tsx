// src/app/bot/coinw-intro/page.tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";

// ❗ 정적 프리렌더 단계 에러 회피
export const dynamic = "force-dynamic";

function CoinWIntroInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const ref = sp.get("ref") ?? "";

  const goNext = () => {
    // 쿼리 안전 처리
    const q = encodeURIComponent(ref);
    router.push(`/bot/coinw-connect?ref=${q}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f3f8fb] px-6">
      <div className="w-full max-w-sm text-center">
        {/* 제목 */}
        <h1 className="text-[16px] font-semibold text-gray-900 leading-6 mb-7">
          봇 이용을 위해서는<br />아래 단계가 필요해요!
        </h1>

        {/* 체크리스트 */}
        <ul className="space-y-3 text-left mb-10">
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-[2px] text-green-500" />
            <span className="text-[14px] text-gray-800 leading-5">
              CoinW{" "}
              <Link
                href="https://www.coinw.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                회원가입
              </Link>
              이 필요해요
            </span>
          </li>

          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-[2px] text-green-500" />
            <span className="text-[14px] text-gray-800 leading-5">
              <Link
                href="https://www.coinw.com/futures"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                선물 계정
              </Link>
              에 자산이 있어야해요
            </span>
          </li>
                    <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-[2px] text-green-500" />
            <span className="text-[14px] text-gray-800 leading-5">
              CoinW 계정과{" "}
              <Link
                href="https://www.coinw.com/assets/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                API연동
              </Link>
              을 해야해요
            </span>
          </li>
        </ul>

        {/* 버튼 */}
        <button
          onClick={goNext}
          className="w-full rounded-[10px] py-3 text-white text-[14px] font-semibold
                     bg-[#2f6dff] hover:bg-[#2559d8] transition
                     shadow-[0_4px_10px_rgba(47,109,255,0.35)]"
        >
          지금 시작하기
        </button>

        {/* (선택) ref 표시 */}
        {ref && (
          <p className="mt-3 text-xs text-gray-500">
            초대코드: <span className="font-medium">{ref}</span>
          </p>
        )}
      </div>
    </main>
  );
}

export default function CoinWIntroPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">로딩중…</div>}>
      <CoinWIntroInner />
    </Suspense>
  );
}
