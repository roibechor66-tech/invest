"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  Check,
  FileText,
  LineChart,
  Compass,
  TrendingUp,
  Mail,
  Monitor,
  Loader2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePortfolio } from "@/lib/portfolio-context";

type AlertCategory = "price_move" | "new_filing" | "trend_mention" | "macro_shift";
type AlertChannel = "in_app" | "email";

interface AlertPreferences {
  channels: AlertChannel[];
  email_address: string | null;
  categories: Record<AlertCategory, boolean>;
  price_move_threshold_pct: number;
}

interface AlertItem {
  id: string;
  ticker: string | null;
  category: AlertCategory;
  title_he: string;
  message_he: string;
  created_at_iso: string;
  read: boolean;
  // Client-only: kept on price_move alerts (computed here, not by the
  // backend) so "why" can be requested for the exact move that triggered
  // the alert, even if the position's live dayChangePct moves on later.
  change_pct?: number;
}

interface ExplanationState {
  loading: boolean;
  text?: string;
  error?: string;
}

interface AlertsCheckResponse {
  new_alerts: AlertItem[];
  email_sent: boolean;
  email_error_he: string | null;
}

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  price_move: "תנועת מחיר חריגה",
  new_filing: "דוח כספי חדש",
  trend_mention: "אזכור בניתוח מגמות",
  macro_shift: "שינוי מאקרו/כלכלי",
};

const CATEGORY_HELP: Record<AlertCategory, string> = {
  price_move: "שינוי יומי במניה מהתיק שחורג מהסף שקבעתם",
  new_filing: "10-K/10-Q חדש שהוגש בפועל ל-SEC עבור מניה מהתיק",
  trend_mention: "מניה מהתיק מוזכרת בממצא חי מ\"ניתוח מגמות\"",
  macro_shift: "כיוון השוק הכללי ב\"מגמות כלכלה\" השתנה",
};

function CategoryIcon({ category }: { category: AlertCategory }) {
  if (category === "price_move") return <TrendingUp size={14} />;
  if (category === "new_filing") return <FileText size={14} />;
  if (category === "trend_mention") return <LineChart size={14} />;
  return <Compass size={14} />;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const DEFAULT_PREFS: AlertPreferences = {
  channels: ["in_app"],
  email_address: null,
  categories: { price_move: true, new_filing: true, trend_mention: true, macro_shift: true },
  price_move_threshold_pct: 5,
};

// Bot feature "התראות מותאמות אישית": unlike the rest of the bot (click a
// role, get a result), this one runs in the background — the user sets
// preferences once (which categories, which channel(s): באתר ו/או אימייל),
// and "בדוק עכשיו" (in a real deployment: a scheduled job) scans the
// portfolio. Three of the four categories are checked on the backend for
// real (new SEC filings, live trend-analysis mentions, a macro-direction
// shift) — see app/services/alerts.py. The fourth, price moves, has no
// server-side price feed to check against (prices are frontend-only mock
// data), so it's computed here from the same dayChangePct the dashboard
// already shows, and merged into the same feed.
export function CustomAlertsPanel({ onBack }: { onBack: () => void }) {
  const { positions } = usePortfolio();
  const [prefs, setPrefs] = useState<AlertPreferences>(DEFAULT_PREFS);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const [inbox, setInbox] = useState<AlertItem[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);

  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [explanations, setExplanations] = useState<Record<string, ExplanationState>>({});

  async function loadAll() {
    setIsLoadingPrefs(true);
    setIsLoadingInbox(true);
    try {
      const [p, i] = await Promise.all([
        apiFetch<AlertPreferences>("/api/alerts/preferences"),
        apiFetch<AlertItem[]>("/api/alerts/inbox"),
      ]);
      setPrefs(p);
      setInbox(i);
    } catch {
      // Keep defaults; the panel is still usable to set preferences.
    } finally {
      setIsLoadingPrefs(false);
      setIsLoadingInbox(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleChannel(channel: AlertChannel) {
    setPrefs((prev) => {
      const has = prev.channels.includes(channel);
      const channels = has ? prev.channels.filter((c) => c !== channel) : [...prev.channels, channel];
      return { ...prev, channels };
    });
  }

  function toggleCategory(category: AlertCategory) {
    setPrefs((prev) => ({
      ...prev,
      categories: { ...prev.categories, [category]: !prev.categories[category] },
    }));
  }

  async function savePreferences() {
    setIsSavingPrefs(true);
    setSaveNote(null);
    try {
      const saved = await apiFetch<AlertPreferences>("/api/alerts/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      setPrefs(saved);
      setSaveNote("ההגדרות נשמרו");
    } catch (err) {
      setSaveNote(err instanceof ApiError ? err.message : "שמירת ההגדרות נכשלה");
    } finally {
      setIsSavingPrefs(false);
    }
  }

  async function markRead(id: string) {
    setInbox((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
    try {
      await apiFetch<AlertItem[]>(`/api/alerts/inbox/${id}/read`, { method: "POST" });
    } catch {
      // best-effort — local state already reflects it
    }
  }

  // "למה?" for a תנועת מחיר חריגה alert: a real, web-search-backed call
  // (research_service.explain_price_move) that finds the actual news/
  // report/rating change behind the move — not a canned guess. Fetched
  // once per alert, on first expand, and cached in `explanations`.
  async function fetchExplanation(alert: AlertItem) {
    if (!alert.ticker) return;
    setExplanations((prev) => ({ ...prev, [alert.id]: { loading: true } }));
    const changePct = alert.change_pct ?? positions.find((p) => p.ticker === alert.ticker)?.dayChangePct ?? 0;
    try {
      const res = await apiFetch<{ explanation_he: string }>("/api/alerts/explain-price-move", {
        method: "POST",
        body: JSON.stringify({ ticker: alert.ticker, change_pct: changePct }),
      });
      setExplanations((prev) => ({ ...prev, [alert.id]: { loading: false, text: res.explanation_he } }));
    } catch (err) {
      setExplanations((prev) => ({
        ...prev,
        [alert.id]: { loading: false, error: err instanceof ApiError ? err.message : "טעינת ההסבר נכשלה" },
      }));
    }
  }

  function toggleExpand(alert: AlertItem) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(alert.id)) {
        next.delete(alert.id);
      } else {
        next.add(alert.id);
        if (alert.category === "price_move" && !explanations[alert.id]) {
          fetchExplanation(alert);
        }
      }
      return next;
    });
  }

  async function checkNow() {
    setIsChecking(true);
    setCheckError(null);
    setCheckNote(null);

    // price_move: computed client-side from the portfolio's own
    // dayChangePct — no backend price feed to check this against.
    const clientPriceAlerts: AlertItem[] = prefs.categories.price_move
      ? positions
          .filter((p) => Math.abs(p.dayChangePct) >= prefs.price_move_threshold_pct)
          .map((p) => ({
            id: `client-price-${p.ticker}-${Date.now()}`,
            ticker: p.ticker,
            category: "price_move" as const,
            title_he: `תנועת מחיר ב-${p.ticker}`,
            message_he: `${p.nameHe} ${p.dayChangePct >= 0 ? "עלתה" : "ירדה"} ${Math.abs(p.dayChangePct).toFixed(1)}% היום — מעל הסף שקבעתם (${prefs.price_move_threshold_pct}%).`,
            created_at_iso: new Date().toISOString(),
            read: false,
            change_pct: p.dayChangePct,
          }))
      : [];

    try {
      const tickers = positions.map((p) => p.ticker);
      const result = await apiFetch<AlertsCheckResponse>("/api/alerts/check", {
        method: "POST",
        body: JSON.stringify({ tickers }),
      });
      const combined = [...clientPriceAlerts, ...result.new_alerts];
      if (combined.length === 0) {
        setCheckNote("נבדק — אין התראות חדשות כרגע");
      } else {
        setInbox((prev) => [...combined, ...prev]);
        setCheckNote(
          `נמצאו ${combined.length} התראות חדשות` +
            (result.email_sent ? " · נשלח גם אימייל" : "") +
            (result.email_error_he ? ` · ${result.email_error_he}` : "")
        );
      }
    } catch (err) {
      // Even if the server-side check fails, still surface any client-side
      // price-move alerts we already computed.
      if (clientPriceAlerts.length > 0) {
        setInbox((prev) => [...clientPriceAlerts, ...prev]);
      }
      setCheckError(err instanceof ApiError ? err.message : "הבדיקה נכשלה");
    } finally {
      setIsChecking(false);
    }
  }

  const unreadCount = inbox.filter((a) => !a.read).length;

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
        התראות שרצות ברקע על התיק שלכם — לא צריך ללחוץ כל פעם. קבעו פה מה
        מעניין אתכם ואיך לקבל את זה, ולחצו &quot;בדוק עכשיו&quot; להרצת בדיקה
        (בסביבת production אמיתית זו תרוץ אוטומטית לפי לוח זמנים).
      </p>

      {/* Preferences */}
      <div className="space-y-4 rounded-lg border border-surface-border bg-surface-raised p-4">
        <p className="text-sm font-bold text-slate-900">הגדרות התראות</p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">איפה לקבל התראות</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleChannel("in_app")}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                prefs.channels.includes("in_app")
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                  : "border-surface-border text-slate-500"
              }`}
            >
              <Monitor size={13} /> באתר
            </button>
            <button
              type="button"
              onClick={() => toggleChannel("email")}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                prefs.channels.includes("email")
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                  : "border-surface-border text-slate-500"
              }`}
            >
              <Mail size={13} /> אימייל
            </button>
          </div>
          {prefs.channels.includes("email") && (
            <input
              type="email"
              value={prefs.email_address ?? ""}
              onChange={(e) => setPrefs((prev) => ({ ...prev, email_address: e.target.value }))}
              placeholder="כתובת אימייל לשליחת ההתראות"
              dir="ltr"
              className="mt-2 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-600 focus:border-brand-500/60 focus:outline-none"
            />
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">אילו התראות מעניינות אתכם</p>
          <div className="space-y-2">
            {(Object.keys(CATEGORY_LABELS) as AlertCategory[]).map((category) => (
              <label
                key={category}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-surface-border bg-surface-card p-2.5"
              >
                <input
                  type="checkbox"
                  checked={prefs.categories[category]}
                  onChange={() => toggleCategory(category)}
                  className="mt-0.5 accent-brand-500"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <CategoryIcon category={category} />
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{CATEGORY_HELP[category]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {prefs.categories.price_move && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              סף לתנועת מחיר יומית (%)
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={prefs.price_move_threshold_pct}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, price_move_threshold_pct: Number(e.target.value) || 0 }))
              }
              className="w-28 rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-sm text-slate-800 focus:border-brand-500/60 focus:outline-none"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={savePreferences}
            disabled={isSavingPrefs || isLoadingPrefs}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-400 disabled:opacity-50"
          >
            {isSavingPrefs ? "שומר..." : "שמירת הגדרות"}
          </button>
          {saveNote && <span className="text-xs text-slate-500">{saveNote}</span>}
        </div>
      </div>

      {/* Check now + feed */}
      <div className="space-y-3 rounded-lg border border-surface-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <BellRing size={15} />
            התראות
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">
                {unreadCount} חדשות
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={checkNow}
            disabled={isChecking}
            className="flex items-center gap-1.5 rounded-lg border border-brand-500/50 px-3 py-1.5 text-xs font-bold text-brand-300 transition hover:bg-brand-500/10 disabled:opacity-50"
          >
            {isChecking && <Loader2 size={13} className="animate-spin" />}
            {isChecking ? "בודק..." : "בדוק עכשיו"}
          </button>
        </div>

        {checkError && <p className="text-xs text-negative">{checkError}</p>}
        {checkNote && <p className="text-xs text-slate-500">{checkNote}</p>}

        {isLoadingInbox && <p className="text-sm text-slate-500">טוען התראות...</p>}

        {!isLoadingInbox && inbox.length === 0 && (
          <p className="text-sm text-slate-500">אין עדיין התראות. לחצו &quot;בדוק עכשיו&quot; כדי להריץ בדיקה.</p>
        )}

        <div className="space-y-2">
          {inbox.map((alert) => {
            const isExpanded = expandedIds.has(alert.id);
            const explanation = explanations[alert.id];
            return (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 transition ${
                  alert.read
                    ? "border-surface-border bg-surface-card opacity-70"
                    : "border-brand-500/40 bg-surface-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(alert)}
                  className="flex w-full items-start justify-between gap-2 text-right"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
                    <CategoryIcon category={alert.category} />
                    <span className="truncate">{alert.title_he}</span>
                    {alert.ticker && <span className="shrink-0 text-slate-500">· {alert.ticker}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500">
                    {formatWhen(alert.created_at_iso)}
                    <ChevronDown
                      size={13}
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {!isExpanded && (
                  <p className="mt-1 truncate text-xs leading-relaxed text-slate-500">{alert.message_he}</p>
                )}

                {isExpanded && (
                  <div className="mt-1.5 space-y-2">
                    <p className="text-xs leading-relaxed text-slate-500">{alert.message_he}</p>

                    {alert.category === "price_move" && (
                      <div className="rounded-md bg-surface-raised p-2">
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-brand-400">
                          <Sparkles size={11} /> למה המניה זזה?
                        </p>
                        {explanation?.loading && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                            <Loader2 size={11} className="animate-spin" /> מחפש את הסיבה...
                          </p>
                        )}
                        {explanation?.error && (
                          <p className="mt-1 text-[11px] text-negative">{explanation.error}</p>
                        )}
                        {explanation?.text && (
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-700">{explanation.text}</p>
                        )}
                      </div>
                    )}

                    {!alert.read && (
                      <button
                        type="button"
                        onClick={() => markRead(alert.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300"
                      >
                        <Check size={11} /> סמן כנקרא
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        לחצו על התראה כדי להרחיב אותה. &quot;דוח כספי חדש&quot;, &quot;אזכור
        בניתוח מגמות&quot; ו&quot;שינוי מאקרו/כלכלי&quot; נבדקים בפועל מול SEC
        EDGAR ומודל ה-AI (אותה חריגה מוצהרת כמו שאר הבוט — ללא נתוני mock).
        &quot;תנועת מחיר חריגה&quot; מחושבת כאן מהשינוי היומי של כל מניה
        בתיק שלכם, ובהרחבה אפשר לבקש הסבר אמיתי (חיפוש אינטרנט חי) לסיבת
        התנועה. שליחת אימייל דורשת הגדרת שרת SMTP בשרת; ללא זה, ההתראות
        ימשיכו להופיע באתר כרגיל.
      </p>
    </div>
  );
}
