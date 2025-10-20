// src/app/admin/bots/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PositionRow = {
  ref_code: string;
  exchange: string | null;
  symbol: string;
  position_side: "LONG" | "SHORT" | string;
  quantity: number | null;
  entry_price: number | null;
  mark_price: number | null;
  unrealized_pnl: number | null;
  leverage: number | null;
  margin_mode: string | null;
  minute_at: string; // ISO
  kst_minute: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 기본 새로고침 3분
const DEFAULT_REFRESH_MS = 180_000;

const number = (v: number | null | undefined, digits = 6) =>
  typeof v === "number" && isFinite(v) ? v.toFixed(digits) : "-";
const compact = (v: number | null | undefined, digits = 2) =>
  typeof v === "number" && isFinite(v) ? v.toFixed(digits) : "-";
const clsx = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(" ");

export default function AdminBotsPage() {
  // ---- 상태 ----
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // KPI
  const [runningUsers, setRunningUsers] = useState<number | null>(null);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);

  // 필터
  const [queryRefCode, setQueryRefCode] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [side, setSide] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [openOnly, setOpenOnly] = useState(true);
  const [missingOnly, setMissingOnly] = useState(false);
  const [exchange, setExchange] = useState<string>("coinw");
  const [levMin, setLevMin] = useState<string>("");
  const [levMax, setLevMax] = useState<string>("");

  // 새로고침 주기
  const [refreshMs, setRefreshMs] = useState<number>(DEFAULT_REFRESH_MS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Supabase REST 호출 ----
  const sbFetch = useCallback(async (path: string, init?: RequestInit) => {
    const url = `${SUPABASE_URL}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    return res;
  }, []);

  // ---- KPI: 실행 중 봇 수 (bot_settings 기준) ----
  const loadUsersRunning = useCallback(async () => {
    try {
      const res = await sbFetch(
        `/rest/v1/bot_settings?is_running=eq.true&select=ref_code`,
        { headers: { Prefer: "count=exact" } }
      );
      const cr = res.headers.get("content-range"); // "0-9/123"
      const total = cr?.split("/")?.[1];
      setRunningUsers(total ? Number(total) : null);
    } catch (e: any) {
      console.warn("bot_settings running fetch failed:", e?.message || e);
      setRunningUsers(null);
    }
  }, [sbFetch]);

  // ---- 최신 포지션(뷰) 쿼리 빌드 ----
  const buildPositionsQuery = useCallback(() => {
    // 최신 1건만 모아둔 뷰 사용
    const base = "/rest/v1/vw_latest_positions";
    const sp = new URLSearchParams();

    sp.set(
      "select",
      [
        "ref_code",
        "exchange",
        "symbol",
        "position_side",
        "quantity",
        "entry_price",
        "mark_price",
        "unrealized_pnl",
        "leverage",
        "margin_mode",
        "minute_at",
        "kst_minute",
      ].join(",")
    );

    // 가독성 높은 정렬
    sp.append("order", "ref_code.asc");
    sp.append("order", "symbol.asc");

    // 필터
    if (openOnly) sp.set("quantity", "gt.0");
    if (queryRefCode.trim()) sp.set("ref_code", `ilike.*${queryRefCode.trim()}*`);
    if (symbols.length) sp.set("symbol", `in.(${symbols.join(",")})`);
    if (side !== "ALL") sp.set("position_side", `eq.${side}`);
    if (exchange) sp.set("exchange", `eq.${exchange}`);
    if (levMin) sp.set("leverage", `gte.${levMin}`);
    if (levMax) sp.append("leverage", `lte.${levMax}`);

    // 결측 경고만 (entry_price OR mark_price 가 null)
    if (missingOnly) {
      // PostgREST의 or= 구문은 괄호 포함 문자열이여야 하며 URL 인코딩 필요
      // URLSearchParams가 자동 인코딩하므로 문자열 그대로 넣으면 됩니다.
      sp.set("or", "(entry_price.is.null,mark_price.is.null)");
    }

    return `${base}?${sp.toString()}`;
  }, [openOnly, missingOnly, queryRefCode, symbols, side, exchange, levMin, levMax]);

  // ---- 데이터 로드 ----
  const loadPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sbFetch(buildPositionsQuery());
      const data = (await res.json()) as PositionRow[];
      setRows(data);
      const latest = data[0]?.minute_at ?? null;
      setLastUpdatedIso(latest);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [sbFetch, buildPositionsQuery]);

  // 최초 로드 & 인터벌
  useEffect(() => {
    loadUsersRunning();
    loadPositions();

    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshMs > 0) {
      timerRef.current = setInterval(() => {
        loadUsersRunning();
        loadPositions();
      }, refreshMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs, buildPositionsQuery]);

  // KPI 계산
  const kpi = useMemo(() => {
    const openRows = rows.filter((r) => (r.quantity ?? 0) > 0);
    const usersWithOpen = new Set(openRows.map((r) => r.ref_code)).size;
    const totalUpnl = openRows.reduce((acc, r) => acc + (r.unrealized_pnl ?? 0), 0);
    const levs = openRows.map((r) => r.leverage ?? NaN).filter((x) => !Number.isNaN(x));
    const avgLev = levs.length ? levs.reduce((a, b) => a + b, 0) / levs.length : null;
    return { usersWithOpen, totalUpnl, avgLev };
  }, [rows]);

  const latestKst = useMemo(() => {
    try {
      return lastUpdatedIso ? new Date(lastUpdatedIso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";
    } catch {
      return "-";
    }
  }, [lastUpdatedIso]);

  const rowClass = (r: PositionRow) => {
    const q = r.quantity ?? 0;
    const warn = q > 0 && (r.entry_price == null || r.mark_price == null);
    return clsx("border-b last:border-b-0", q === 0 && "opacity-60", warn && "bg-yellow-50");
  };

  // 심볼 입력 보조
  const [symbolInput, setSymbolInput] = useState("");
  const addSymbol = () => {
    const s = symbolInput.trim().toUpperCase();
    if (!s) return;
    if (!symbols.includes(s)) setSymbols((xs) => [...xs, s]);
    setSymbolInput("");
  };
  const removeSymbol = (s: string) => setSymbols((xs) => xs.filter((x) => x !== s));

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">봇 운영현황</h1>
          <p className="text-sm text-gray-600">유저×심볼 최신 포지션 스냅샷. 자동 새로고침.</p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600">자동 새로고침</label>
          <select
            className="border rounded px-2 py-1"
            value={String(refreshMs)}
            onChange={(e) => setRefreshMs(Number(e.target.value))}
          >
            <option value={180000}>3분</option>
            <option value={300000}>5분</option>
            <option value={0}>끄기(수동)</option>
          </select>
          <button className="ml-2 rounded px-3 py-1 border hover:bg-gray-50" onClick={() => { loadUsersRunning(); loadPositions(); }}>
            지금 새로고침
          </button>
        </div>
      </header>

      {/* KPI */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Running 유저 수" value={runningUsers ?? "-"} />
        <KpiCard label="오픈포지션 유저 수" value={kpi.usersWithOpen} />
        <KpiCard
          label="총 미실현 PnL (USDT)"
          value={compact(kpi.totalUpnl, 2)}
          valueClass={kpi.totalUpnl >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
        <KpiCard label="평균 레버리지" value={kpi.avgLev ? compact(kpi.avgLev, 2) : "-"} />
        <KpiCard label="데이터 최신(KST)" value={latestKst} />
      </section>

      {/* 필터 바 */}
      <section className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500">ref_code</label>
            <input
              className="border rounded px-2 py-1"
              placeholder="MC10..."
              value={queryRefCode}
              onChange={(e) => setQueryRefCode(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500">symbol 추가</label>
            <div className="flex gap-2">
              <input
                className="border rounded px-2 py-1"
                placeholder="XRPUSDT"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSymbol()}
              />
              <button className="border rounded px-3 py-1" onClick={addSymbol}>
                추가
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500">side</label>
            <select className="border rounded px-2 py-1" value={side} onChange={(e) => setSide(e.target.value as any)}>
              <option value="ALL">ALL</option>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">exchange</label>
            <input className="border rounded px-2 py-1 w-28" value={exchange} onChange={(e) => setExchange(e.target.value)} />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">레버리지</label>
            <input className="border rounded px-2 py-1 w-20" placeholder="min" value={levMin} onChange={(e) => setLevMin(e.target.value)} />
            <span className="text-gray-400">~</span>
            <input className="border rounded px-2 py-1 w-20" placeholder="max" value={levMax} onChange={(e) => setLevMax(e.target.value)} />
          </div>

          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              오픈만(수량 &gt; 0)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              결측 경고만
            </label>
          </div>

          <button className="ml-auto rounded px-3 py-1 border hover:bg-gray-50" onClick={loadPositions}>
            적용
          </button>
        </div>

        {symbols.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {symbols.map((s) => (
              <span key={s} className="inline-flex items-center gap-2 text-xs border rounded-full px-2 py-1">
                {s}
                <button onClick={() => removeSymbol(s)} className="text-gray-500 hover:text-black" title="제거">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 표 */}
      <section className="rounded-lg border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th>ref_code</Th>
              <Th>exch</Th>
              <Th>symbol</Th>
              <Th>side</Th>
              <Th className="text-right">qty</Th>
              <Th className="text-right">entry</Th>
              <Th className="text-right">mark</Th>
              <Th className="text-right">uPnL</Th>
              <Th className="text-right">lev</Th>
              <Th>margin</Th>
              <Th>updated(KST)</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-gray-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-rose-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-gray-500">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((r, i) => {
                const qty = r.quantity ?? 0;
                const upnl = r.unrealized_pnl ?? 0;
                const warn = qty > 0 && (r.entry_price == null || r.mark_price == null);
                const updatedKst =
                  r.kst_minute ?? new Date(r.minute_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
                return (
                  <tr key={`${r.ref_code}-${r.symbol}-${r.position_side}-${i}`} className={rowClass(r)}>
                    <Td>{r.ref_code}</Td>
                    <Td>{r.exchange ?? "-"}</Td>
                    <Td>{r.symbol}</Td>
                    <Td>
                      <span
                        className={clsx(
                          "px-2 py-0.5 rounded-full border",
                          r.position_side === "LONG"
                            ? "border-emerald-300 text-emerald-700"
                            : "border-rose-300 text-rose-700"
                        )}
                      >
                        {r.position_side}
                      </span>
                    </Td>
                    <Td align="right">{number(r.quantity, 6)}</Td>
                    <Td align="right">{number(r.entry_price, 6)}</Td>
                    <Td align="right">{number(r.mark_price, 6)}</Td>
                    <Td align="right" className={clsx(upnl >= 0 ? "text-emerald-600" : "text-rose-600", "font-medium")}>
                      {number(r.unrealized_pnl, 4)}
                    </Td>
                    <Td align="right">{compact(r.leverage, 2)}</Td>
                    <Td>{r.margin_mode ?? "-"}</Td>
                    <Td>
                      {updatedKst}
                      {warn && <span className="ml-2 text-xs text-amber-600">⚠ 결측</span>}
                    </Td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function KpiCard({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="rounded-xl border p-4 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={clsx("mt-1 text-lg font-semibold tabular-nums", valueClass)}>{value}</div>
    </div>
  );
}
function Th({ children, className }: { children: any; className?: string }) {
  return <th className={clsx("px-3 py-2 text-left font-medium", className)}>{children}</th>;
}
function Td({
  children,
  align = "left",
  className,
}: {
  children: any;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return <td className={clsx("px-3 py-2", alignCls, className)}>{children}</td>;
}
