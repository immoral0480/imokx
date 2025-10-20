"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* =========================
   툴바 (이전 단계에서 만든 것)
========================= */
function RewardToolbar() {
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);

  const handleCalculate = async () => {
    if (loadingCalc || loadingPay) return;
    setLoadingCalc(true);
    try {
      const res = await fetch("/api/admin/rewards/calc", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "리워드 계산 실패");
      alert(
        `✅ 리워드 계산 완료\n집계일: ${data?.rewardDate}\n범위: ${data?.period?.start} ~ ${data?.period?.end}\n저장건수: ${data?.inserted ?? 0}`
      );
    } catch (e: any) {
      alert(`❌ 계산 오류: ${e.message ?? e}`);
    } finally {
      setLoadingCalc(false);
    }
  };

  const handlePayout = async () => {
    if (loadingCalc || loadingPay) return;
    if (!confirm("보류(pending) 대상에게 USDT 송금을 실행할까요?")) return;

    setLoadingPay(true);
    try {
      const res = await fetch("/api/admin/rewards/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "송금 실행 실패");

      alert(
        `✅ 송금 완료\n처리:${data?.processed ?? 0}\n성공:${data?.completed ?? 0}\n실패:${data?.failed ?? 0}`
      );
    } catch (e: any) {
      alert(`❌ 송금 오류: ${e.message ?? e}`);
    } finally {
      setLoadingPay(false);
    }
  };

  return (
    <div className="w-full flex items-center gap-3 mb-4">
      <button
        onClick={handleCalculate}
        disabled={loadingCalc || loadingPay}
        className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
      >
        {loadingCalc ? "계산 중…" : "리워드 계산"}
      </button>

      <button
        onClick={handlePayout}
        disabled={loadingCalc || loadingPay}
        className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-50"
      >
        {loadingPay ? "송금 중…" : "리워드 송금"}
      </button>
    </div>
  );
}

/* =========================
   reward_transfers 테이블 그리드
========================= */
type TransferRow = {
  id?: string;
  ref_code: string | null;
  name: string | null;
  wallet_address: string | null;
  referral_amount: number | null;
  center_amount: number | null;
  total_amount: number | null;
  status: "pending" | "completed" | "failed" | string;
  tx_hash: string | null;
  error_message: string | null;
  executed_at: string | null;  // timestamptz
  reward_date: string | null;  // date
  created_at: string | null;   // timestamptz
};

function RewardTransfersTable() {
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 필터/페이지네이션
  const [rewardDate, setRewardDate] = useState<string>(""); // YYYY-MM-DD
  const [statusFilter, setStatusFilter] = useState<string>(""); // '', 'pending', 'completed', 'failed'
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 합계 표시
  const totals = useMemo(() => {
    const sum = (k: keyof TransferRow) =>
      rows.reduce((acc, r) => acc + (Number(r[k] || 0)), 0);
    return {
      referral: sum("referral_amount"),
      center: sum("center_amount"),
      total: sum("total_amount"),
    };
  }, [rows]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("reward_transfers")
        .select(
          "id, ref_code, name, wallet_address, referral_amount, center_amount, total_amount, status, tx_hash, error_message, executed_at, reward_date, created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (rewardDate) query = query.eq("reward_date", rewardDate);
      if (statusFilter) query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as TransferRow[]);
    } catch (e) {
      console.error(e);
      alert("데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewardDate, statusFilter, page]);

  const resetAndReload = () => {
    setPage(1);
    fetchData();
  };

  return (
    <section className="space-y-3">
      {/* 필터 */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">정산일(reward_date)</label>
          <input
            type="date"
            value={rewardDate}
            onChange={(e) => { setPage(1); setRewardDate(e.target.value); }}
            className="border rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">상태</label>
          <select
            value={statusFilter}
            onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">전체</option>
            <option value="pending">pending</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
        </div>

        <button
          onClick={resetAndReload}
          className="px-3 py-2 rounded-lg bg-gray-100 border"
          disabled={loading}
        >
          새로고침
        </button>

        <div className="ml-auto text-sm text-gray-600">
          합계: 초대 {totals.referral.toFixed(2)} / 센터 {totals.center.toFixed(2)} / 총 {totals.total.toFixed(2)}
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto border rounded-xl">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">ref_code(지급대상)</th>
              <th className="px-3 py-2 text-left">name</th>
              <th className="px-3 py-2 text-left">wallet_address</th>
              <th className="px-3 py-2 text-right">referral_amount</th>
              <th className="px-3 py-2 text-right">center_amount</th>
              <th className="px-3 py-2 text-right">total_amount</th>
              <th className="px-3 py-2 text-left">status</th>
              <th className="px-3 py-2 text-left">tx_hash</th>
              <th className="px-3 py-2 text-left">error_message</th>
              <th className="px-3 py-2 text-left">executed_at</th>
              <th className="px-3 py-2 text-left">reward_date</th>
              <th className="px-3 py-2 text-left">created_at</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={12}>
                  데이터가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.id ?? r.ref_code}-${r.reward_date ?? r.created_at}`} className="border-t">
                <td className="px-3 py-2">{r.ref_code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 break-all">{r.wallet_address}</td>
                <td className="px-3 py-2 text-right">{Number(r.referral_amount ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{Number(r.center_amount ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{Number(r.total_amount ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 break-all">{r.tx_hash}</td>
                <td className="px-3 py-2">{r.error_message}</td>
                <td className="px-3 py-2">{r.executed_at?.replace("T", " ").replace("Z", "")}</td>
                <td className="px-3 py-2">{r.reward_date}</td>
                <td className="px-3 py-2">{r.created_at?.replace("T", " ").replace("Z", "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-end gap-2">
        <button
          className="px-3 py-1 border rounded-lg disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
        >
          이전
        </button>
        <span className="text-sm">페이지 {page}</span>
        <button
          className="px-3 py-1 border rounded-lg disabled:opacity-50"
          onClick={() => setPage((p) => p + 1)}
          disabled={loading || rows.length < pageSize}
        >
          다음
        </button>
      </div>
    </section>
  );
}

/* =========================
   페이지 컴포넌트
========================= */
export default function AdminRewardPage() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold mb-2">리워드 송금</h1>
      <p className="text-sm text-gray-600 mb-6">
        계산 실행 → 분류별 확인 → 종합/송금 대상 관리 플로우.
      </p>

      {/* 버튼 툴바 */}
      <RewardToolbar />

      {/* reward_transfers 테이블 표시 */}
      <RewardTransfersTable />
    </main>
  );
}
