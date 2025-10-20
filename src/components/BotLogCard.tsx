"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type LogRow = {
  id: string;
  created_at: string;
  event_type:
    | "start"
    | "entry_price"
    | "order_attempt"
    | "order_result"
    | "step"
    | "stop"
    | "error"
    | "close"
    | string;
  step: number | null;
  message: string;
  order_status: "success" | "failed" | "pending" | null;
};

const EVENT_TABS = [
  { key: "all", label: "전체" },
  { key: "start", label: "시작/정지" },
  { key: "step", label: "STEP" },
  { key: "order", label: "주문" },
  { key: "price", label: "가격" },
  { key: "error", label: "오류" },
] as const;

export default function BotLogCard({ refCode }: { refCode: string }) {
  const [rawRows, setRawRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] =
    useState<(typeof EVENT_TABS)[number]["key"]>("all");
  const [stepFilter, setStepFilter] = useState<number | "all">("all");

  const newestTsRef = useRef<string | null>(null);

  async function fetchLogs(fullReload = false) {
    let query = supabase
      .from("bot_logs")
      .select("id, created_at, event_type, step, message, order_status")
      .eq("ref_code", refCode)
      .order("created_at", { ascending: false })
      .limit(80);

    if (activeTab === "start") {
      query = query.in("event_type", ["start", "stop", "close"]);
    } else if (activeTab === "step") {
      query = query.eq("event_type", "step");
    } else if (activeTab === "order") {
      query = query.in("event_type", ["order_attempt", "order_result"]);
    } else if (activeTab === "price") {
      query = query.in("event_type", ["entry_price"]);
    } else if (activeTab === "error") {
      query = query.eq("event_type", "error");
    }

    if (activeTab === "step" && stepFilter !== "all") {
      query = query.eq("step", stepFilter as number);
    }

    const { data, error } = await query;
    if (error) return;
    setRawRows((data ?? []) as LogRow[]);
    setLoading(false);

    if (data && data.length > 0) {
      newestTsRef.current = data[0].created_at;
    }
  }

  useEffect(() => {
    fetchLogs(true);
    const id = setInterval(() => fetchLogs(true), 8000);
    return () => clearInterval(id);
  }, [refCode, activeTab, stepFilter]);

  // STEP 로그는 각 번호당 1회만 표시
  const rowsToShow = useMemo(() => {
    const seenSteps = new Set<number>();
    const keep: LogRow[] = [];

    for (const r of rawRows) {
      if (r.event_type === "step" && typeof r.step === "number") {
        if (seenSteps.has(r.step)) {
          continue; // 같은 STEP이면 건너뜀
        }
        seenSteps.add(r.step);
      }
      keep.push(r);
    }

    return keep;
  }, [rawRows]);

  const icon = (r: LogRow) => {
    if (r.event_type === "start") return "🟢";
    if (r.event_type === "stop") return "⏹️";
    if (r.event_type === "close") return "📤";
    if (r.event_type === "entry_price") return "🎯";
    if (r.event_type === "order_attempt") return "📦";
    if (r.event_type === "order_result")
      return r.order_status === "success"
        ? "✅"
        : r.order_status === "failed"
        ? "❌"
        : "⏳";
    if (r.event_type === "step") return `🔢${r.step ?? ""}`;
    if (r.event_type === "error") return "🔴";
    return "•";
  };

  return (
    <div className="rounded-2xl border p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-base">BotLogCard</div>
        <button
          className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-50"
          onClick={() => fetchLogs(true)}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {EVENT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-xs px-2 py-1 rounded-lg border ${
              activeTab === t.key
                ? "bg-black text-white border-black"
                : "bg-white hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
        {activeTab === "step" && (
          <div className="ml-auto">
            <select
              className="text-xs px-2 py-1 border rounded-lg"
              value={stepFilter}
              onChange={(e) =>
                setStepFilter(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                )
              }
            >
              <option value="all">STEP 전체</option>
              {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                <option key={s} value={s}>
                  STEP {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : rowsToShow.length === 0 ? (
        <div className="text-sm text-gray-500">표시할 로그가 없습니다.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {rowsToShow.map((r) => {
            const time = new Date(r.created_at).toLocaleTimeString("ko-KR");
            return (
              <li key={r.id} className="flex gap-2 items-start">
                <span className="w-6 text-center">{icon(r)}</span>
                <span className="text-gray-500 shrink-0">{time}</span>
                <span className="flex-1 leading-5">{r.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
