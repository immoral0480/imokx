"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";

interface TopBarProps {
  icon?: ReactNode;
  title: string;
  showBack?: boolean;
  onBack?: () => void; // ✅ 추가
}

export default function TopBar({ icon, title, showBack = false, onBack }: TopBarProps) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-50 w-full bg-white border-b border-gray-200">
      <div className="w-full flex justify-center">
        <div className="w-full max-w-[500px] px-4 py-1 flex items-center space-x-2">
          {showBack && (
            <img
              src="/icon-back.png"
              alt="뒤로가기"
              className="w-5 h-5 cursor-pointer"
              onClick={onBack || (() => router.back())} // ✅ 동적 처리
            />
          )}
          {icon && <div>{icon}</div>}
          <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
        </div>
      </div>
    </div>
  );
}

