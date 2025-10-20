// src/app/admin/subscriptions/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminAuth from "@/components/AdminAuth";

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 숨길 컬럼 목록
  const hiddenColumns = ["created_at"];

  const loadAll = async () => {
    try {
      setLoading(true);
      setErr(null);

      // 전체 컬럼 조회 + 최신순
      const { data, error } = await supabase
        .from("enrollments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      setErr(e?.message ?? "구독현황 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // 동적 컬럼(숨김 제외)
  const columns = useMemo(
    () =>
      rows[0]
        ? Object.keys(rows[0]).filter((c) => !hiddenColumns.includes(c))
        : [],
    [rows]
  );

  const toText = (v: any) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  return (
    <AdminAuth>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">📚 구독현황</h1>
        <p className="text-sm text-gray-600">
          <code>public.enrollments</code>의 전체 컬럼을 표시합니다. (단, <code>created_at</code>은 숨김)
        </p>

        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="bg-gray-800 text-white rounded px-4 py-2">
            새로고침
          </button>
        </div>

        {loading && <div>불러오는 중…</div>}
        {err && <div className="text-red-500">{err}</div>}

        {!loading && !err && (
          <div className="rounded-lg border border-gray-200 overflow-auto w-full max-h-[75vh]">
            <table className="w-full text-sm table-auto">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="px-3 py-2 text-left font-medium text-gray-700 border-b whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length || 1}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}

                {rows.map((r, i) => (
                  <tr key={r.id ?? r.uuid ?? i} className="odd:bg-white even:bg-gray-50 align-top">
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="px-3 py-2 border-b whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {toText(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminAuth>
  );
}
