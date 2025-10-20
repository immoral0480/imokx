"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";

type Props = { refCode: string };

export default function CoinWApiCard({ refCode }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-md border p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-blue-50">
          <KeyRound className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">COINW API 연동하기</p>
          <p className="text-xs text-gray-500">봇 실행을 위해 API 키를 연결하세요</p>
        </div>
      </div>
      <Link
        href={`/bot/coinw-intro?ref=${refCode}`}
        className="w-full block text-center bg-blue-600 text-white py-2 rounded-xl font-semibold hover:bg-blue-700"
      >
        API 연동하기
      </Link>
    </div>
  );
}
