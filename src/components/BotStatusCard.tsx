"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Activity, PlayCircle, PauseCircle, AlertTriangle, RefreshCw, Clock } from "lucide-react";

type BotStatus = "running" | "stopped" | "error" | "unknown";
type Props = { refCode?: string | null };

const AUTO_POLL_MS = 180_000; // 3분

export default function BotStatusCard({ refCode }: Props) {
  // prop이 없을 때만 내부에서 조회해 사용
  const [refCodeState, setRefCodeState] = useState<string | null>(null);
  const [status, setStatus] = useState<BotStatus>("unknown");

  // 최초 로딩(라벨에만 반영), 조용한 새로고침 상태
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loading, setLoading] = useState(false);      // 버튼 클릭 등 명시적 로딩
  const [refreshing, setRefreshing] = useState(false); // 백그라운드(조용한) 갱신

  const [autoPoll, setAutoPoll] = useState(true);
  const [latestMsg, setLatestMsg] = useState<string | null>(null);
  const [latestAt, setLatestAt] = useState<string | null>(null);

  const effectiveRefCode = refCode ?? refCodeState;

  // prop으로 refCode를 안 넘긴 경우에만 Supabase에서 조회
  useEffect(() => {
    if (refCode) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("users").select("ref_code").eq("id", user.id).single();
      setRefCodeState(data?.ref_code ?? null);
    })();
  }, [refCode]);

  const label = useMemo(() => {
    if (isInitialLoad && loading) return "확인 중...";
    if (status === "running") return "실행 중";
    if (status === "stopped") return "중지됨";
    if (status === "error") return "오류";
    return "알 수 없음";
  }, [status, loading, isInitialLoad]);

  const iconEl = useMemo(() => {
    if (status === "running") return <PlayCircle className="w-8 h-8" />;
    if (status === "stopped") return <PauseCircle className="w-8 h-8" />;
    if (status === "error")   return <AlertTriangle className="w-8 h-8" />;
    return <AlertTriangle className="w-8 h-8" />;
  }, [status]);

  const dotColor = useMemo(() => {
    if (status === "running") return "bg-green-500";
    if (status === "stopped") return "bg-gray-400";
    if (status === "error")   return "bg-red-500";
    return "bg-yellow-500";
  }, [status]);

  // 조용한 새로고침을 위한 fetchStatus(silent)
  const fetchStatus = async (opts: { silent?: boolean } = {}) => {
    if (!effectiveRefCode) return;

    const silent = opts.silent ?? !isInitialLoad; // 최초 1회만 loading, 이후엔 silent
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1) 실시간 상태(백엔드 FastAPI 프록시)
      const resp = await fetch("/api/bot/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref_code: effectiveRefCode }),
      });
      const json = (await resp.json()) as any;

      // /api/bot/status 응답 호환 처리
      // - { success, status: "running"|"stopped"|"error"|"unknown" }
      // - 또는 { running: boolean }
      let realtime: BotStatus = "unknown";
      if (typeof json?.status === "string") {
        const s = json.status as string;
        if (s === "running" || s === "stopped" || s === "error") realtime = s;
      } else if (typeof json?.running === "boolean") {
        realtime = json.running ? "running" : "stopped";
      }

      // 2) 최신 히스토리(Supabase) — 상태/메시지/시간
      const resp2 = await fetch("/api/bot/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref_code: effectiveRefCode }),
      });
      const hist = await resp2.json();

      let nextStatus: BotStatus = realtime;
      let nextMsg: string | null = null;
      let nextAt: string | null = null;

      if (hist?.success && hist?.latest) {
        const latestStatus: string | undefined = hist.latest.status;
        const normalized: BotStatus =
          latestStatus === "running" || latestStatus === "stopped" || latestStatus === "error"
            ? (latestStatus as BotStatus)
            : "unknown";

        // 폴백: 실시간이 unknown이면 히스토리 상태 사용
        nextStatus = realtime === "unknown" ? normalized : realtime;
        nextMsg = hist.latest.message ?? null;
        nextAt = hist.latest.created_at ?? null;
      }

      // 변경됐을 때만 업데이트 → 불필요한 재렌더 감소
      setStatus(prev => (prev !== nextStatus ? nextStatus : prev));
      setLatestMsg(prev => (prev !== nextMsg ? nextMsg : prev));
      setLatestAt(prev => (prev !== nextAt ? nextAt : prev));
    } catch {
      // 네트워크/예외 시 상태를 강제로 unknown으로 바꾸지는 않음 (번쩍임 방지)
      if (isInitialLoad) setStatus("unknown");
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  };

  // 최초/변경 시 1회 로드 (명시적 로딩)
  useEffect(() => {
    if (effectiveRefCode) fetchStatus({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRefCode]);

  // 자동 폴링 (3분) — 탭이 보일 때만, 복귀 시 1회 즉시 갱신
  useEffect(() => {
    if (!autoPoll || !effectiveRefCode) return;

    const tick = () => fetchStatus({ silent: true });

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { timer = setInterval(tick, AUTO_POLL_MS); };
    const stop  = () => { if (timer) clearInterval(timer); };

    if (document.visibilityState === "visible") start();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();   // 복귀 즉시 1회
        start();  // 그리고 재개
      } else {
        stop();   // 숨김 시 중단
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, effectiveRefCode]);

  return (
    <div className="p-4 rounded-2xl shadow-md bg-white flex items-start justify-between">
      <div className="flex items-start space-x-3">
        <div className="relative">
          <Activity className="text-blue-600" />
          <span className={`absolute -right-1 -top-1 w-3 h-3 rounded-full ${dotColor}`} />
        </div>
        <div>
          <p className="text-sm text-gray-500">봇 실행 현황</p>
          <div className="flex items-center space-x-2">
            <p className="font-semibold text-lg">{label}</p>
            {iconEl}
          </div>

          {(latestMsg || latestAt) && (
            <div className="mt-2 text-xs text-gray-500 flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>{latestAt ? new Date(latestAt).toLocaleString("ko-KR") : ""}</span>
              {latestMsg && <span className="truncate max-w-[14rem]">· {latestMsg}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={() => fetchStatus({ silent: false })}
          className="px-3 py-2 rounded-xl border text-sm flex items-center space-x-1 hover:bg-gray-50"
          disabled={loading}
          aria-label="새로고침"
          title="즉시 새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing || loading ? "animate-spin" : ""}`} />
          <span>새로고침</span>
        </button>

        <label className="ml-2 inline-flex items-center space-x-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={autoPoll}
            onChange={(e) => setAutoPoll(e.target.checked)}
          />
          <span>자동 갱신(3분)</span>
        </label>
      </div>
    </div>
  );
}
