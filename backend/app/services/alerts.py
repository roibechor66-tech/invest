"""Custom, portfolio-driven alerts.

Unlike the rest of the AI bot (click a role, get a result on demand), this
feature is meant to run in the background: the user sets preferences once
(which categories they care about, which channel(s) to be notified on), and
a scan — triggered here by "בדוק עכשיו", or by a real scheduled job in a
production deployment — checks the portfolio for things worth flagging and
stores/delivers them.

Four alert categories, matching the proposal the user approved:

- ``price_move`` — a position moved more than the configured threshold in a
  day. This one is intentionally NOT computed here: the backend has no live
  price feed (prices are frontend-only mock data, via portfolio-context's
  ``dayChangePct``), so the frontend computes this category itself from data
  it already has and merges it into the same inbox/UI. See
  ``CustomAlertsPanel.tsx``.
- ``new_filing`` — a portfolio ticker has a newer 10-K/10-Q on SEC EDGAR than
  the last one we saw for it. Reuses ``find_latest_filing`` (real SEC EDGAR
  lookup, no mock).
- ``trend_mention`` — a portfolio ticker/company shows up in the live
  "ניתוח מגמות" web-search results. Reuses ``analyze_trends`` (real,
  web-search-backed, no mock) — same declared "real AI" exception as the
  rest of the research service.
- ``macro_shift`` — the weekly "מגמות כלכלה" market_direction changed since
  the last check. Reuses the existing weekly-cached ``get_economic_trends``.

Storage is the same "good enough for a single-process demo backend" JSON
file pattern used by the economic-trends cache — a real deployment would use
a shared database and a real scheduler (e.g. a cron-triggered worker) instead
of an on-demand endpoint.
"""

from __future__ import annotations

import json
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path

from app.core.config import settings
from app.models.schemas import (
    AlertItem,
    AlertPreferences,
    AlertsCheckResponse,
)
from app.services.research import analyze_trends, find_latest_filing, get_economic_trends

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PREFERENCES_PATH = DATA_DIR / "alert_preferences.json"
INBOX_PATH = DATA_DIR / "alerts_inbox.json"
STATE_PATH = DATA_DIR / "alerts_scan_state.json"

MAX_INBOX_ITEMS = 200


# --- Preferences -------------------------------------------------------


def get_preferences() -> AlertPreferences:
    if not PREFERENCES_PATH.exists():
        return AlertPreferences()
    try:
        raw = json.loads(PREFERENCES_PATH.read_text(encoding="utf-8"))
        return AlertPreferences.model_validate(raw)
    except Exception:
        return AlertPreferences()


def save_preferences(prefs: AlertPreferences) -> AlertPreferences:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PREFERENCES_PATH.write_text(
        json.dumps(prefs.model_dump(), ensure_ascii=False), encoding="utf-8"
    )
    return prefs


# --- Inbox ---------------------------------------------------------------


def get_inbox() -> list[AlertItem]:
    if not INBOX_PATH.exists():
        return []
    try:
        raw = json.loads(INBOX_PATH.read_text(encoding="utf-8"))
        items = [AlertItem.model_validate(item) for item in raw]
    except Exception:
        return []
    return sorted(items, key=lambda item: item.created_at_iso, reverse=True)


def _save_inbox(items: list[AlertItem]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    trimmed = sorted(items, key=lambda item: item.created_at_iso, reverse=True)[:MAX_INBOX_ITEMS]
    INBOX_PATH.write_text(
        json.dumps([item.model_dump() for item in trimmed], ensure_ascii=False), encoding="utf-8"
    )


def mark_read(alert_id: str) -> bool:
    items = get_inbox()
    found = False
    for item in items:
        if item.id == alert_id:
            item.read = True
            found = True
    if found:
        _save_inbox(items)
    return found


# --- Scan state (dedupe across runs) --------------------------------------


def _load_state() -> dict:
    if not STATE_PATH.exists():
        return {"last_filing_dates": {}, "last_market_direction": None}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"last_filing_dates": {}, "last_market_direction": None}


def _save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def _new_alert(ticker: str | None, category, title_he: str, message_he: str) -> AlertItem:
    return AlertItem(
        id=uuid.uuid4().hex,
        ticker=ticker,
        category=category,
        title_he=title_he,
        message_he=message_he,
        created_at_iso=datetime.now(timezone.utc).isoformat(),
        read=False,
    )


# --- Email delivery --------------------------------------------------------


def _send_email(to_address: str, alerts: list[AlertItem]) -> None:
    if not (
        settings.smtp_host
        and settings.smtp_username
        and settings.smtp_password
        and settings.smtp_from_address
    ):
        raise ValueError(
            "שליחת התראות באימייל אינה זמינה כרגע — לא הוגדרו פרטי שרת SMTP בשרת "
            "(SMTP_HOST / SMTP_USERNAME / SMTP_PASSWORD / SMTP_FROM_ADDRESS). "
            "התראות באתר ממשיכות לעבוד כרגיל."
        )
    body = "\n\n".join(f"{a.title_he}\n{a.message_he}" for a in alerts)
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = "התראות חדשות מהפלטפורמה שלכם"
    message["From"] = settings.smtp_from_address
    message["To"] = to_address
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except Exception as exc:
        raise ValueError(f"שליחת האימייל נכשלה: {exc}") from exc


# --- The scan itself -------------------------------------------------------


def check_alerts(tickers: list[str]) -> AlertsCheckResponse:
    prefs = get_preferences()
    state = _load_state()
    new_alerts: list[AlertItem] = []

    if prefs.categories.get("new_filing", True):
        last_filing_dates: dict = state.setdefault("last_filing_dates", {})
        for ticker in tickers:
            key = ticker.strip().upper()
            try:
                filing = find_latest_filing(ticker)
            except ValueError:
                # Not SEC-listed (e.g. an Israeli .TA ticker) or lookup
                # failed — skip quietly for this category, same as the
                # manual "ניתוח דוחות אוטומטי" flow treats such tickers.
                continue
            if last_filing_dates.get(key) != filing.filed_date:
                new_alerts.append(
                    _new_alert(
                        ticker,
                        "new_filing",
                        f"דוח חדש: {filing.company_name}",
                        f"{filing.form_type} עבור התקופה שהסתיימה {filing.period_of_report} "
                        f"הוגש ב-{filing.filed_date}. אפשר לנתח אותו ב\"ניתוח דוחות אוטומטי\".",
                    )
                )
                last_filing_dates[key] = filing.filed_date

    if prefs.categories.get("trend_mention", True) and tickers:
        try:
            trends = analyze_trends()
        except ValueError:
            # No ANTHROPIC_API_KEY configured, or the live web-search call
            # failed — same declared exception as the rest of the bot, no
            # silent mock fallback; just skip this category for this scan.
            trends = None
        if trends is not None:
            seen_mentions: list = state.setdefault("seen_trend_mentions", [])
            ticker_set = {t.strip().upper() for t in tickers}
            for trend in trends.trends:
                mentioned = [
                    company
                    for company in trend.relevant_companies
                    if company.strip().upper() in ticker_set
                ]
                for ticker in mentioned:
                    mention_key = f"{ticker.strip().upper()}::{trend.title_he}"
                    if mention_key in seen_mentions:
                        continue  # already alerted for this specific mention
                    seen_mentions.append(mention_key)
                    new_alerts.append(
                        _new_alert(
                            ticker,
                            "trend_mention",
                            f"{ticker} מוזכר בניתוח מגמות",
                            f"{trend.title_he} — {trend.summary_he}",
                        )
                    )
            # Keep this list from growing unbounded across many scans.
            state["seen_trend_mentions"] = seen_mentions[-500:]

    if prefs.categories.get("macro_shift", True):
        try:
            econ = get_economic_trends()
        except ValueError:
            econ = None
        if econ is not None:
            last_direction = state.get("last_market_direction")
            if last_direction is not None and last_direction != econ.market_direction:
                new_alerts.append(
                    _new_alert(
                        None,
                        "macro_shift",
                        "שינוי בכיוון השוק לפי מגמות כלכלה",
                        f"הכיוון הכללי השתנה מ-{last_direction} ל-{econ.market_direction}. "
                        f"{econ.outlook_he}",
                    )
                )
            state["last_market_direction"] = econ.market_direction

    _save_state(state)

    if new_alerts:
        inbox = get_inbox()
        _save_inbox(inbox + new_alerts)

    email_sent = False
    email_error_he: str | None = None
    if new_alerts and "email" in prefs.channels and prefs.email_address:
        try:
            _send_email(prefs.email_address, new_alerts)
            email_sent = True
        except ValueError as exc:
            email_error_he = str(exc)

    return AlertsCheckResponse(new_alerts=new_alerts, email_sent=email_sent, email_error_he=email_error_he)
