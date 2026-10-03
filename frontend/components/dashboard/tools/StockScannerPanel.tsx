"use client";

import { useEffect, useRef, useState } from "react";
import {
  Flame,
  Rocket,
  Building2,
  Activity,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Info,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";

function formatQuotePct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// A compact live price + day-change chip, shown alongside the AI's own
// qualitative price_action_he text. Fetches once per card rather than
// polling (see useLiveQuote's `refreshIntervalMs: null`) — a scan can
// list up to ~20 tickers across its four watchlists, and this data
// already refreshes only every few hours server-side, so there's no
// need for each card to poll Finnhub independently every few seconds.
function LiveQuoteChip({ ticker }: { ticker: string }) {
  const { quote, isLoading } = useLiveQuote(ticker, { refreshIntervalMs: null });
  if (isLoading) return <span className="text-xs text-slate-400">טוען מחיר...</span>;
  if (!quote) return null;
  return (
    <span className="flex items-center gap-1 text-xs" dir="ltr">
      <span className="font-bold text-slate-900">${quote.price.toFixed(2)}</span>
      <span className={quote.dayChangePct >= 0 ? "text-positive" : "text-negative"}>
        {formatQuotePct(quote.dayChangePct)}
      </span>
    </span>
  );
}

interface TrendSource {
  title: string;
  url: string;
}

interface ScannerStockIdea {
  ticker: string;
  company_name: string;
  reason_he: string;
  price_action_he: string | null;
  signal_he: string | null;
  risk_note_he: string | null;
}

interface OptionsFlowIdea {
  ticker: string;
  company_name: string;
  flow_type: "call" | "put";
  reason_he: string;
  premium_he: string | null;
  expiration_he: string | null;
  sentiment_he: string | null;
  risk_note_he: string | null;
}

interface StockScannerResult {
  generated_at_he: string;
  trending: ScannerStockIdea[];
  momentum_breakouts: ScannerStockIdea[];
  smart_money: ScannerStockIdea[];
  smart_money_methodology_he: string;
  unusual_options: OptionsFlowIdea[];
  sources: TrendSource[];
  cached_at_iso: string | null;
}

// POST /api/scanner/scan and GET /api/scanner/scan/status both return this.
interface StockScannerJob {
  status: "idle" | "running" | "done" | "error";
  result: StockScannerResult | null;
  error_he: string | null;
}

const SCAN_POLL_INTERVAL_MS = 5000;

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function StockCard({ idea }: { idea: ScannerStockIdea }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900" dir="ltr">
            {idea.ticker}
          </span>
          <LiveQuoteChip ticker={idea.ticker} />
        </span>
        <span className="text-xs text-slate-500">{idea.company_name}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{idea.reason_he}</p>
      {idea.price_action_he && (
        <p className="mt-1 text-xs font-semibold text-slate-800">{idea.price_action_he}</p>
      )}
      {idea.signal_he && (
        <p className="mt-1 text-xs leading-relaxed text-brand-300">{idea.signal_he}</p>
      )}
      {idea.risk_note_he && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-amber-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{idea.risk_note_he}</span>
        </p>
      )}
    </div>
  );
}

function OptionsFlowCard({ idea }: { idea: OptionsFlowIdea }) {
  const isCall = idea.flow_type === "call";
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900" dir="ltr">
            {idea.ticker}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              isCall ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
            }`}
          >
            {isCall ? "CALL" : "PUT"}
          </span>
          <LiveQuoteChip ticker={idea.ticker} />
        </div>
        <span className="text-xs text-slate-500">{idea.company_name}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{idea.reason_he}</p>
      {(idea.premium_he || idea.expiration_he) && (
        <p className="mt-1 text-xs text-slate-500">
          {idea.premium_he}
          {idea.premium_he && idea.expiration_he && " · "}
          {idea.expiration_he}
        </p>
      )}
      {idea.sentiment_he && (
        <p className="mt-1 text-xs leading-relaxed text-brand-300">{idea.sentiment_he}</p>
      )}
      {idea.risk_note_he && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-amber-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{idea.risk_note_he}</span>
        </p>
      )}
    </div>
  );
}

// Bot feature "סורק מניות": four watchlists from one live web-search-
// backed Claude call — trending stocks, momentum breakouts with real
// social-media buzz, stocks showing public-filing-based signs of
// institutional/insider ("smart money") accumulation, and stocks with
// unusual PUT/CALL options flow. The "smart money" category is
// explicitly caveated (13F filings lag ~45 days; Form 4 insider buys
// are genuinely close to real-time; nothing here is live knowledge of a
// fund's actual book) — see `smart_money_methodology_he`, always shown.
// The options-flow category is caveated per-pick instead (risk_note_he),
// since unusual flow can reflect hedging/spreads, not just a directional
// bet. Same declared "real AI, not mock" exception as the rest of the
// bot; cached server-side for a few hours with a manual "רענן עכשיו".
export function StockScannerPanel({ onBack }: { onBack: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockScannerResult | null>(null);
  // A fresh scan takes several minutes, so the backend runs it as a
  // background job and we poll its status instead of holding one request
  // open. The timer ref lets us stop polling when the panel unmounts.
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  function stopPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }

  function finish() {
    setIsLoading(false);
    setIsRefreshing(false);
  }

  function handleJob(job: StockScannerJob) {
    if (!isMounted.current) return;
    if (job.status === "done" && job.result) {
      setResult(job.result);
      finish();
    } else if (job.status === "running") {
      pollTimer.current = setTimeout(poll, SCAN_POLL_INTERVAL_MS);
    } else if (job.status === "error") {
      setError(job.error_he ?? "הרצת סורק המניות נכשלה");
      finish();
    } else {
      setError("הסריקה הופסקה (השרת הופעל מחדש) — לחצו \"רענן עכשיו\" כדי להריץ שוב");
      finish();
    }
  }

  async function poll() {
    try {
      handleJob(await apiFetch<StockScannerJob>("/api/scanner/scan/status"));
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof ApiError ? err.message : "בדיקת סטטוס הסריקה נכשלה");
      finish();
    }
  }

  async function load(force: boolean) {
    stopPolling();
    if (force) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      handleJob(
        await apiFetch<StockScannerJob>(`/api/scanner/scan${force ? "?force=true" : ""}`, {
          method: "POST",
        })
      );
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof ApiError ? err.message : "הרצת סורק המניות נכשלה");
      finish();
    }
  }

  useEffect(() => {
    isMounted.current = true;
    load(false);
    return () => {
      isMounted.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        חזרה לתפריט הבוט
      </button>

      <p className="text-sm leading-relaxed text-slate-500">
        סריקת שוק חיה מבוססת חיפוש אינטרנט: המניות הכי טרנדיות כרגע, מניות
        שמתחילות מהלך עולה טכני יחד עם באז אמיתי ברשתות החברתיות, מניות עם
        סימנים ציבוריים (לא בזמן אמת) לצבירה מוסדית/פנימית — "כסף חכם" —
        ומניות עם זרימת אופציות PUT/CALL חריגה.
      </p>

      {isLoading && !result && (
        <p className="text-sm text-slate-500">
          מריץ סריקת שוק חיה... זה לוקח בדרך כלל 3-5 דקות (חיפושים באינטרנט + ניתוח). הסריקה
          רצה ברקע — אפשר לסגור את החלון ולחזור אליו מאוחר יותר.
        </p>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="space-y-5 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              {result.generated_at_he}
              {result.cached_at_iso && ` · עודכן: ${formatUpdatedAt(result.cached_at_iso)}`}
            </span>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50"
            >
              <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "מרענן ברקע (כמה דקות)..." : "רענן עכשיו"}
            </button>
          </div>

          {result.trending.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">
                <Flame size={13} /> מניות טרנדיות
              </p>
              <div className="space-y-2">
                {result.trending.map((idea, i) => (
                  <StockCard key={i} idea={idea} />
                ))}
              </div>
            </div>
          )}

          {result.momentum_breakouts.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-positive">
                <Rocket size={13} /> פריצות מומנטום + באז ברשת
              </p>
              <div className="space-y-2">
                {result.momentum_breakouts.map((idea, i) => (
                  <StockCard key={i} idea={idea} />
                ))}
              </div>
            </div>
          )}

          {result.smart_money.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">
                <Building2 size={13} /> כסף חכם — קרנות גידור וגופים מוסדיים
              </p>
              <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-surface-border bg-surface-card p-2.5 text-[11px] leading-relaxed text-slate-500">
                <Info size={12} className="mt-0.5 shrink-0 text-slate-500" />
                <span>{result.smart_money_methodology_he}</span>
              </div>
              <div className="space-y-2">
                {result.smart_money.map((idea, i) => (
                  <StockCard key={i} idea={idea} />
                ))}
              </div>
            </div>
          )}

          {result.unusual_options.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                <Activity size={13} /> זרימת אופציות חריגה — PUT/CALL
              </p>
              <div className="space-y-2">
                {result.unusual_options.map((idea, i) => (
                  <OptionsFlowCard key={i} idea={idea} />
                ))}
              </div>
            </div>
          )}

          {result.sources.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">מקורות</p>
              <ul className="space-y-1">
                {result.sources.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-400"
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            הסריקה נוצרה אוטומטית על ידי מודל AI על בסיס חיפוש אינטרנט חי,
            ומתעדכנת עד אחת לכמה שעות (ניתן לרענן ידנית בכל רגע). מניות
            טרנדיות/מומנטום הן לרוב תנודתיות מאוד, אותות ה"כסף החכם"
            מבוססים על דיווחים ציבוריים (ולא על ידיעה בזמן אמת), וזרימת
            אופציות חריגה עשויה לשקף גידור או אסטרטגיית ספרד ולא בהכרח
            הימור כיווני — זה אינו ייעוץ השקעות ואינו תחליף לבדיקת נאותות
            עצמאית.
          </p>
        </div>
      )}
    </div>
  );
}
