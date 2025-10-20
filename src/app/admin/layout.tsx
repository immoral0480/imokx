import type { ReactNode } from "react";
import AdminTopNav from "@/components/admin/AdminTopNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      {/* 상단 탭 */}
      <AdminTopNav />
      {/* 컨텐츠 컨테이너 */}
      <main className="mx-auto max-w-full px-4 py-6">{children}</main>
    </div>
  );
}
