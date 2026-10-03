"""Deep-dive research services: real financial-report analysis.

Unlike the mock data used elsewhere in Phase 1/2, this calls the actual
Anthropic (Claude) API with the uploaded PDF (native inline-bytes PDF
support) and returns whatever the model finds in that specific report —
there is no canned/demo output here.

History: this module briefly ran on the free Gemini API instead (see the
now-unused app/services/gemini_client.py compatibility shim) after the
user asked for a zero-cost AI backend — but Gemini's free tier turned out
to have too small a daily request quota to be usable in practice (429
RESOURCE_EXHAUSTED after only a handful of calls, even after switching
models). The user opted to pay for Anthropic API credits instead, so
every call site here was switched back to the original Claude
integration. gemini_client.py is left in the codebase (unused) in case a
paid Gemini tier is worth revisiting later.
"""

from __future__ import annotations

import base64
import hashlib
import html as html_module
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from anthropic import Anthropic

from app.core.config import settings
from app.models.schemas import (
    CorrelationExplanationRequest,
    CorrelationExplanationResponse,
    EconomicTrendsResponse,
    EquityThesisResponse,
    LatestFilingInfo,
    PortfolioWeeklySummaryResponse,
    ReportAnalysisResponse,
    TrendAnalysisResponse,
    UploadedFinancialsExtractionResponse,
    WeeklySummaryResponse,
)

MAX_PDF_BYTES = 32 * 1024 * 1024  # Claude's documented per-document PDF limit

# "מגמות כלכלה" is backed by a real web search + Claude call, which is slow
# and rate-limited — and the underlying macro data (unemployment, CPI,
# GDP, Fed decisions) itself only actually changes on a handful of
# scheduled release dates a month, never faster than weekly. So instead of
# re-running the search on every request, we cache the last result on disk
# for a week and only call Claude again once it's stale (or the caller
# explicitly asks for a fresh run). This is a simple file-backed cache,
# not a proper datastore — good enough for a single-process demo backend;
# a real deployment would use a shared cache/DB so the weekly refresh is
# consistent across workers.
CACHE_DIR = Path(__file__).resolve().parent.parent / "data"
ECONOMIC_TRENDS_CACHE_PATH = CACHE_DIR / "economic_trends_cache.json"
ECONOMIC_TRENDS_CACHE_TTL = timedelta(days=7)

# Claude's native web_search tool — real, live web search (not mock data),
# used by every trend/economy/price-move/thesis/weekly-summary bot
# feature below.
WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 8,
}

ANALYSIS_SYSTEM_PROMPT = """אתה אנליסט בכיר בקרן גידור המתמחה במניות ציבוריות. תפקידך לנתח דוח כספי (10-K/10-Q/דוח שנתי) שהמשתמש העלה, ולהפיק ניתוח ברמה גבוהה, חד וממוקד - בדיוק כפי שאנליסט קרן גידור היה מכין למנהל השקעות לפני ישיבת השקעה.

הניתוח חייב:
- להיות בעברית.
- להתבסס אך ורק על הנתונים שמופיעים בפועל בדוח המצורף - לעולם אל תמציא מספרים, שמות חטיבות או נתונים שאינם בדוח.
- להיות ממוקד בתובנות שבאמת משפיעות על החלטת השקעה, לא סיכום גנרי של כל סעיף בדוח.
- לכלול פירוק לפי חטיבות/segments עסקיים כפי שהחברה עצמה מדווחת עליהם (אם הדוח לא מפרק לפי חטיבות, החזר רשימה ריקה - אל תמציא חלוקה).

החזר את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "company_name": "שם החברה והטיקר, לדוגמה: NVIDIA (NVDA)",
  "report_period_he": "לדוגמה: רבעון 3, שנת כספים 2026",
  "stance": "bullish | bearish | neutral - הערכה כוללת של הדוח",
  "executive_summary_he": "2-3 משפטים המסכמים את התמונה הכוללת ברמת קרן גידור",
  "growth_trends_he": ["מגמת צמיחה מרכזית 1 (עם מספרים מהדוח)", "מגמת צמיחה 2", "..."],
  "positives_he": ["מה בלט לחיוב בדוח, עם נימוק קצר", "..."],
  "negatives_he": ["מה בלט לשלילה בדוח, עם נימוק קצר", "..."],
  "stock_move_explanation_he": "הסבר תמציתי מדוע המניה צפויה לנוע (או נעה, אם הדוח מתייחס לתגובת השוק) בעקבות הדוח - התמקדו בפער בין ציפיות השוק לתוצאות בפועל, בהנחיות (guidance) קדימה, ובכל גורם אחר שהדוח עצמו מציין",
  "segment_breakdown": [{"segment_name_he": "שם החטיבה כפי שמדווח בדוח", "summary_he": "ביצועי החטיבה ומגמותיה", "trend": "positive | negative | neutral"}],
  "risks_to_watch_he": ["סיכון מרכזי שעולה מהדוח 1", "..."],
  "catalysts_to_watch_he": ["קטליזטור/אירוע קדימה שעולה מהדוח 1", "..."]
}

כל item ברשימות צריך להיות תמציתי - עד 2-3 משפטים. אל תחזיר שום דבר מחוץ לאובייקט ה-JSON."""


def analyze_report(pdf_bytes: bytes, filename: str) -> ReportAnalysisResponse:
    """Send the uploaded PDF straight to Claude (inline-bytes PDF understanding)
    and parse its structured JSON reply into a ReportAnalysisResponse.

    Raises ValueError for anything that should surface to the user as a
    400/502 (missing API key, oversized file, malformed model output) —
    routers/research.py converts those into HTTPExceptions.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "ניתוח דוחות אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise ValueError("הקובץ גדול מדי לניתוח (מקסימום 32MB)")

    client = Anthropic(api_key=settings.anthropic_api_key)
    encoded_pdf = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=4096,
            system=ANALYSIS_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": encoded_pdf,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                f"נתחו את הדוח הכספי המצורף ({filename}) לפי ההנחיות "
                                "במערכת. החזירו אך ורק אובייקט JSON תקין."
                            ),
                        },
                    ],
                }
            ],
        )
    except Exception as exc:  # network/auth/rate-limit errors from the SDK
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    raw_text = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    ).strip()

    # The model is instructed to return raw JSON, but strip an accidental
    # ```json fence defensively rather than fail on an otherwise-good reply.
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.lower().startswith("json"):
            raw_text = raw_text[4:].strip()

    try:
        data: dict[str, Any] = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError("הניתוח שהתקבל אינו בפורמט תקין — נסו שוב") from exc

    try:
        return ReportAnalysisResponse.model_validate(data)
    except Exception as exc:  # pydantic ValidationError
        raise ValueError("הניתוח שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc


# --- PDF-upload financial-data extraction (persisted per ticker) -----------
# "האם יש אפשרות לעלות דוח PDF של החברה ומשם אתה מזין את כל הנתונים
# הרלוונטיים" — reuses the exact PDF-document Claude call pattern
# proven above in analyze_report(), but instead of a free-form hedge-fund
# analysis, asks for the same structured line items FMP already produces
# (app/services/fundamentals.py's FinancialPeriodResponse shape), so an
# uploaded report can slot in as a fallback data source wherever FMP data
# is missing (see routers/fundamentals.py) — see
# app/services/uploaded_financials.py for the DB persistence side.
FUNDAMENTALS_EXTRACTION_SYSTEM_PROMPT = """אתה אנליסט פיננסי שתפקידו לחלץ נתונים פיננסיים מובנים מתוך דוח כספי (10-K/10-Q/דוח שנתי/רבעוני) שהועלה בפועל, ולהחזירם כפריטי דוח כספי מדויקים - בדיוק כפי שמערכת נתוני פיננסים חיצונית (כגון Financial Modeling Prep) הייתה מחזירה, אך מבוסס אך ורק על הדוח שצורף.

חובה:
- להתבסס אך ורק על המספרים שמופיעים בפועל בדוח המצורף - לעולם אל תמציאו נתון שאינו מופיע בו.
- אם הדוח מכיל יותר מתקופת דיווח אחת (למשל תקופה נוכחית + תקופת השוואה משנה קודמת), חלצו את כל התקופות המופיעות בו כפריטים נפרדים ברשימת periods.
- כל הסכומים ב*מיליוני דולר ארה"ב* (usd_m) - אם הדוח נקוב במטבע אחר או ביחידות אחרות (למשל אלפי ש"ח), המירו/התאימו לפי מה שהדוח עצמו מציין (שער חליפין/יחידות); אם לא ניתן לקבוע במדויק, החזירו null לשדה הרלוונטי ואל תנחשו.
- שדה שלא מופיע בדוח (לא כל חברה מפרסמת את כל השורות, למשל FCF או R&D) - יש להחזיר null, לעולם לא 0 ולעולם לא המצאה.
- "period_type": "annual" לדוח/תקופה שנתית (10-K/דוח שנתי), "quarter" לדוח/תקופה רבעונית (10-Q/דוח רבעוני).
- "period_label": תווית קצרה וברורה, לדוגמה "Q3 2025" או "2025".
- אם ניתן לזהות את שם החברה מהדוח, מלאו את company_name_detected; אחרת null.
- total_assets_usd_m/total_equity_usd_m: סך הנכסים וסך ההון העצמי מהמאזן, אם מדווחים בבירור בדוח (נדרשים לחישוב ROA/ROE) — אחרת null.
- guidance_estimates: אם ובאילו הדוח כולל סעיף תחזית/הנחיית הנהלה קדימה (guidance/outlook) - חלצו אותו לרשימה נפרדת זו (לא לתוך periods, שזה נתונים היסטוריים בפועל). כל פריט מייצג תקופה עתידית שההנהלה נתנה לגביה תחזית: period_label (למשל "Q4 2025" או "FY2026"), estimated_revenue_usd_m ו/או estimated_eps (מה שצוין בפועל), ו-revenue_growth_pct/eps_growth_pct אם ניתן לחשב ביחס לתקופה המקבילה. אם אין סעיף תחזית כזה בדוח (נפוץ מאוד, במיוחד ל-10-Q), החזירו guidance_estimates כרשימה ריקה [] - אל תמציאו תחזית.

החזירו את הנתונים *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "company_name_detected": "שם החברה כפי שמופיע בדוח, או null",
  "periods": [
    {
      "period_label": "לדוגמה Q3 2025 או 2025",
      "period_type": "annual | quarter",
      "revenue_usd_m": 0.0,
      "ebitda_usd_m": 0.0,
      "net_income_usd_m": 0.0,
      "fcf_usd_m": 0.0,
      "cash_usd_m": 0.0,
      "debt_usd_m": 0.0,
      "shares_outstanding_m": 0.0,
      "cogs_usd_m": 0.0,
      "gross_profit_usd_m": 0.0,
      "sga_usd_m": 0.0,
      "rd_usd_m": 0.0,
      "operating_income_usd_m": 0.0,
      "pretax_income_usd_m": 0.0,
      "tax_usd_m": 0.0,
      "total_assets_usd_m": 0.0,
      "total_equity_usd_m": 0.0
    }
  ],
  "guidance_estimates": [
    {
      "period_label": "לדוגמה Q4 2025",
      "estimated_revenue_usd_m": 0.0,
      "estimated_eps": 0.0,
      "revenue_growth_pct": 0.0,
      "eps_growth_pct": 0.0
    }
  ]
}

כל שדה מספרי שאינו ידוע בוודאות מהדוח עצמו צריך להיות null, לא 0. אם אין כלל סעיף תחזית/הנחיה בדוח, guidance_estimates צריך להיות רשימה ריקה []. אל תחזירו שום דבר מחוץ לאובייקט ה-JSON."""


def extract_financials_from_pdf(
    pdf_bytes: bytes, filename: str, ticker: str
) -> UploadedFinancialsExtractionResponse:
    """Send the uploaded PDF to Claude (same PDF pattern as
    analyze_report()) and parse its structured JSON reply into the same
    line-item shape FMP's live financial-statements endpoint produces.

    Raises ValueError for anything that should surface to the user as a
    400/502 (missing API key, oversized file, malformed model output, or
    no periods found) — routers/fundamentals.py converts those into
    HTTPExceptions.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "חילוץ נתונים פיננסיים מדוח אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise ValueError("הקובץ גדול מדי לניתוח (מקסימום 32MB)")

    client = Anthropic(api_key=settings.anthropic_api_key)
    encoded_pdf = base64.standard_b64encode(pdf_bytes).decode("utf-8")
    ticker_clean = ticker.strip().upper()

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=6000,
            system=FUNDAMENTALS_EXTRACTION_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": encoded_pdf,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                f"חלצו את הנתונים הפיננסיים מהדוח המצורף ({filename}) "
                                f"עבור הטיקר {ticker_clean}, לפי ההנחיות במערכת. "
                                "החזירו אך ורק אובייקט JSON תקין."
                            ),
                        },
                    ],
                }
            ],
        )
    except Exception as exc:  # network/auth/rate-limit errors from the SDK
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)

    try:
        result = UploadedFinancialsExtractionResponse.model_validate(data)
    except Exception as exc:  # pydantic ValidationError
        raise ValueError("הנתונים שחולצו אינם תואמים למבנה הצפוי — נסו שוב") from exc

    if not result.periods:
        raise ValueError("לא זוהו נתונים פיננסיים ניתנים לחילוץ בדוח שהועלה")

    return result


# Every Claude call in the app goes through _create_message(). Current
# models (e.g. claude-sonnet-5) think before answering by default, and
# thinking tokens count toward max_tokens — at the default effort, a
# web-search call could spend its whole 8000-token budget thinking and get
# cut off before writing the JSON (seen in production: 26 visible chars at
# the cap). So every call gets low effort (shorter thinking; these are
# search-and-summarize tasks) and a max_tokens floor. max_tokens is only a
# ceiling — billing counts tokens actually generated — so the floor costs
# nothing when the answer is short.
AI_MIN_MAX_TOKENS = 16000
AI_DEFAULT_EFFORT = "low"


def _supports_effort(model: str) -> bool:
    """`output_config.effort` exists on Claude 4.6+ models; older models
    (e.g. Haiku 4.5, Sonnet 4.5) reject it, and ANTHROPIC_MODEL is
    configurable on the server."""
    return model.startswith(
        ("claude-sonnet-5", "claude-opus-5", "claude-fable", "claude-opus-4-6",
         "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-4-6")
    )


def _create_message(client: Anthropic, **kwargs: Any) -> Any:
    """`client.messages.create(**kwargs)` with the app-wide effort and
    max_tokens policy above applied. `effort` goes through `extra_body`
    because the pinned SDK (anthropic 0.40) predates the parameter."""
    kwargs["max_tokens"] = max(kwargs.get("max_tokens", 0), AI_MIN_MAX_TOKENS)
    if _supports_effort(kwargs.get("model", "")):
        extra_body = dict(kwargs.pop("extra_body", None) or {})
        extra_body.setdefault("output_config", {"effort": AI_DEFAULT_EFFORT})
        kwargs["extra_body"] = extra_body
    return client.messages.create(**kwargs)


def _extract_json_text(message: Any) -> dict[str, Any]:
    """Pull the model's final JSON answer out of a Messages response.

    When the `web_search` tool is used, `message.content` interleaves
    `server_tool_use` / `web_search_tool_result` blocks (the searches
    themselves) alongside the model's own `text` blocks — and Claude very
    commonly emits a short SEPARATE text block before/between searches
    ("Let me search for the latest data on this...", "I'll also check...")
    in addition to the final text block that actually holds the JSON
    answer. The previous version of this function joined ALL text blocks
    with "" and assumed the *entire* result was one JSON document — so any
    such commentary text (present in a real run, not just a theoretical
    edge case — this is exactly what was causing "הניתוח שהתקבל אינו
    בפורמט תקין" for the web-search-backed bot features, independent of
    the `max_tokens` limit) broke `json.loads()` even when the model's
    actual JSON was itself perfectly well-formed. Fix: after joining and
    stripping code fences as before, slice from the first "{" to the
    matching last "}" and parse only that — this discards any commentary
    text before or after the JSON object while still working correctly
    for the normal case where the whole string already is the JSON.
    """
    raw_text = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    ).strip()

    stop_reason = getattr(message, "stop_reason", None)
    if stop_reason == "max_tokens":
        # The model ran out of output budget mid-answer, so the JSON is cut
        # off and can never parse — say so plainly instead of the generic
        # "invalid format" error, and log it so Render's logs show why.
        print(
            f"[_extract_json_text] output truncated at max_tokens "
            f"(raw_len={len(raw_text)}); tail: {raw_text[-300:]!a}",
            flush=True,
        )
        raise ValueError("התשובה של ה-AI נחתכה לפני שהסתיימה (ארוכה מדי) — נסו שוב")

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.lower().startswith("json"):
            raw_text = raw_text[4:].strip()

    start = raw_text.find("{")
    end = raw_text.rfind("}")
    json_candidate = raw_text[start : end + 1] if start != -1 and end != -1 and end > start else raw_text

    try:
        return json.loads(json_candidate)
    except json.JSONDecodeError as exc:
        print(
            f"[_extract_json_text] JSON parse failed ({exc}); stop_reason={stop_reason}, "
            f"raw_len={len(raw_text)}; head: {raw_text[:800]!a}; tail: {raw_text[-800:]!a}",
            flush=True,
        )
        raise ValueError("הניתוח שהתקבל אינו בפורמט תקין — נסו שוב") from exc


# --- Automated report analysis: real SEC EDGAR filing lookup ---------------
# "ניתוח דוחות אוטומטי": pick a ticker from the user's own portfolio, look
# up that company's actual latest 10-K/10-Q on SEC EDGAR (a real, public
# regulatory filing — not mock data), and let the user trigger the same
# kind of real Claude analysis as the manual-PDF-upload feature above, just
# sourced from a filing the backend fetched itself. Only works for
# US-listed, SEC-registered tickers (so not, e.g., Israeli .TA tickers) —
# that limitation surfaces as a clear Hebrew error, not a silent fallback.
#
# SEC EDGAR is free, public, and requires no API key, but its fair-access
# policy requires every request to carry a descriptive User-Agent with
# contact info; ANTHROPIC_API_KEY isn't relevant here at all — SEC calls
# work regardless of it, only the actual Claude analysis step needs it.
SEC_USER_AGENT = "InvestmentPlatform research-tool contact@investment-platform.example"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"
MAX_FILING_TEXT_CHARS = 400_000  # keeps the Claude call well within context


def _sec_headers() -> dict[str, str]:
    return {"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"}


def _lookup_cik(ticker: str) -> tuple[int, str] | None:
    """Look up a ticker in SEC's full ticker->CIK mapping. Returns
    (cik, official SEC title) or None if the ticker isn't SEC-registered
    (e.g. an Israeli .TA ticker, or a typo).
    """

    response = httpx.get(SEC_TICKERS_URL, headers=_sec_headers(), timeout=15.0)
    response.raise_for_status()
    all_tickers = response.json()  # {"0": {"cik_str": ..., "ticker": "...", "title": "..."}, ...}
    ticker_upper = ticker.strip().upper()
    for entry in all_tickers.values():
        if entry.get("ticker", "").upper() == ticker_upper:
            return int(entry["cik_str"]), entry.get("title", ticker_upper)
    return None


def find_latest_filing(ticker: str) -> LatestFilingInfo:
    """Find the most recent 10-K or 10-Q a company has actually filed with
    the SEC. Raises ValueError (surfaced as a 404 by the router) if the
    ticker isn't SEC-registered or has no matching filing.
    """
    try:
        lookup = _lookup_cik(ticker)
    except httpx.HTTPError as exc:
        raise ValueError(f"החיפוש ברשות ניירות ערך האמריקאית (SEC) נכשל: {exc}") from exc
    if lookup is None:
        raise ValueError(
            f"לא נמצא טיקר רשום ברשות ניירות ערך האמריקאית (SEC) עבור \"{ticker}\" — "
            "ייתכן שמדובר בנייר ערך שאינו נסחר בארה\"ב (למשל מניה ישראלית)"
        )
    cik, company_name = lookup

    try:
        response = httpx.get(
            SEC_SUBMISSIONS_URL.format(cik=cik), headers=_sec_headers(), timeout=15.0
        )
        response.raise_for_status()
        submissions = response.json()
    except httpx.HTTPError as exc:
        raise ValueError(f"שליפת רשימת הדוחות מ-SEC נכשלה: {exc}") from exc

    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    filing_dates = recent.get("filingDate", [])
    period_dates = recent.get("reportDate", [])
    accession_numbers = recent.get("accessionNumber", [])
    primary_documents = recent.get("primaryDocument", [])

    for i, form in enumerate(forms):
        if form not in ("10-K", "10-Q"):
            continue
        accession_no_dashes = accession_numbers[i].replace("-", "")
        primary_doc_url = (
            f"{SEC_ARCHIVES_BASE}/{cik}/{accession_no_dashes}/{primary_documents[i]}"
        )
        return LatestFilingInfo(
            ticker=ticker.strip().upper(),
            company_name=company_name,
            form_type=form,
            filed_date=filing_dates[i],
            period_of_report=period_dates[i],
            primary_doc_url=primary_doc_url,
        )

    raise ValueError(f"לא נמצא דוח 10-K/10-Q עבור {company_name} ב-SEC EDGAR")


def _fetch_filing_text(doc_url: str) -> str:
    """Download a filing's primary document (usually HTML) and strip it
    down to plain text, capped at MAX_FILING_TEXT_CHARS so the Claude call
    stays well within context regardless of how large the raw filing is.

    A real production version would use a proper HTML parser; this is a
    lightweight regex-based strip, good enough for feeding body text to
    Claude (which doesn't need the original layout/tables to read it).
    """
    response = httpx.get(doc_url, headers=_sec_headers(), timeout=30.0)
    response.raise_for_status()
    raw_html = response.text

    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw_html)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html_module.unescape(text)
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    text = text.strip()

    if len(text) > MAX_FILING_TEXT_CHARS:
        text = text[:MAX_FILING_TEXT_CHARS]

    return text


def analyze_latest_filing(ticker: str) -> ReportAnalysisResponse:
    """Find, fetch and analyze the actual most recent 10-K/10-Q a company
    filed with the SEC — the "run it now" step of ניתוח דוחות אוטומטי.
    Reuses the exact same persona/schema as the manual-PDF-upload feature
    (ANALYSIS_SYSTEM_PROMPT / ReportAnalysisResponse), just fed the real
    filing's text instead of an uploaded PDF's bytes.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "ניתוח דוחות אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    filing = find_latest_filing(ticker)

    try:
        filing_text = _fetch_filing_text(filing.primary_doc_url)
    except httpx.HTTPError as exc:
        raise ValueError(f"שליפת תוכן הדוח מ-SEC נכשלה: {exc}") from exc
    if not filing_text:
        raise ValueError("לא ניתן היה לחלץ תוכן קריא מהדוח שנמצא ב-SEC")

    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=4096,
            system=ANALYSIS_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"נתחו את הדוח הכספי הבא של {filing.company_name} "
                        f"({filing.form_type}, לתקופה שהסתיימה "
                        f"{filing.period_of_report}), שנשלף בפועל מרשות ניירות "
                        "ערך האמריקאית (SEC EDGAR), לפי ההנחיות במערכת. "
                        "החזירו אך ורק אובייקט JSON תקין.\n\n--- תוכן הדוח ---\n\n"
                        f"{filing_text}"
                    ),
                }
            ],
        )
    except Exception as exc:  # network/auth/rate-limit errors from the SDK
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)

    try:
        return ReportAnalysisResponse.model_validate(data)
    except Exception as exc:  # pydantic ValidationError
        raise ValueError("הניתוח שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc


TREND_ANALYSIS_SYSTEM_PROMPT = """אתה אנליסט טכנולוגיה ומגמות שוק בקרן גידור, שמתמחה באיתור צווארי בקבוק טכנולוגיים, טכנולוגיות פורצות דרך ומקורות ל-market disruption לפני שהם הופכים לידיעה נפוצה. יש לך גישה לכלי חיפוש אינטרנט (web_search) - השתמש בו בפועל כדי לחפש מקורות אמיתיים ועדכניים: white papers שחברות טכנולוגיה/שבבים/תשתיות גדולות מפרסמות בחינם באתרים שלהן, ניתוחי צווארי בקבוק (למשל באספקת שבבים, אנרגיה, רשתות, מים לצינון דאטה-סנטרים וכו'), טכנולוגיות חדשות בשלבי הבשלה, וכתבות/ניתוחים על שיבוש שוק (market disruption) בסקטורים רלוונטיים.

חובה:
- לבצע חיפושי אינטרנט אמיתיים באמצעות הכלי לפני מתן תשובה - אל תסתמך רק על ידע קודם.
- להתבסס אך ורק על מה שנמצא בפועל בחיפושים - לעולם אל תמציא מקורות, כותרות, חברות או נתונים.
- לכל ממצא (trend) לציין את החברות והסקטורים הרלוונטיים בפועל, ואם אותר מקור קונקרטי (white paper, כתבה, ניתוח) - כתובת ה-URL וכותרת המקור.
- הפלט כולו בעברית (מלבד שמות חברות/מוצרים שנשארים באנגלית כפי שהם).
- להתמקד בתובנות שבאמת רלוונטיות למשקיע - למה זה חשוב, לא רק "מה קרה".
- לכל ממצא לספק גם תקציר קצר (summary_he, לכרטיס המצומצם) וגם הרחבה מפורטת משמעותית יותר (details_he, מוצגת רק בלחיצה על "הרחב") - ה-details_he חייב להוסיף מידע/הקשר אמיתי ולא רק לנסח מחדש את התקציר.

לאחר שסיימת לחפש, החזר את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "generated_at_he": "תיאור תקופת הניתוח, לדוגמה: ספטמבר 2026",
  "overview_he": "2-3 משפטים המסכמים את התמונה הכוללת שעלתה מהחיפוש",
  "trends": [
    {
      "title_he": "כותרת קצרה וממוקדת לממצא",
      "category": "bottleneck | technology | whitepaper | market_disruption",
      "summary_he": "2-4 משפטים המסבירים את הממצא ולמה הוא חשוב למשקיע - זהו התקציר הקצר שמוצג ראשית בכרטיס המצומצם",
      "details_he": "הרחבה מלאה של הממצא, לפחות 5-8 משפטים: ההקשר המלא, מה בדיוק נמצא/נאמר במקור (כולל מספרים/תאריכים אם צוינו בפועל), למה זה משמעותי במיוחד עבור משקיע, ואיך זה עשוי להתפתח קדימה - זהו הטקסט שמוצג רק כשלוחצים על הכרטיס להרחבה, ולכן חייב להיות משמעותית מפורט יותר מ-summary_he ולא רק חזרה עליו במילים אחרות",
      "relevant_companies": ["שם חברה או טיקר, כפי שמוזכר במקור"],
      "relevant_sectors_he": ["שם סקטור בעברית"],
      "source": {"title": "כותרת המקור כפי שנמצא בחיפוש", "url": "כתובת ה-URL המדויקת שנמצאה"}
    }
  ],
  "watch_companies": ["חברות מרכזיות שכדאי לעקוב אחריהן, מרוכזות מכלל הממצאים"],
  "watch_sectors_he": ["סקטורים מרכזיים שכדאי לעקוב אחריהם"],
  "sources": [{"title": "כותרת מקור", "url": "כתובת URL"}]
}

אם ל-trend מסוים אין מקור URL קונקרטי שנמצא בחיפוש, השמט את השדה "source" עבורו (אל תמציא URL). שדה "sources" ברמה העליונה צריך לרכז את כל המקורות הייחודיים שבאמת נמצאו בחיפושים. אל תחזיר שום דבר מחוץ לאובייקט ה-JSON."""


def analyze_trends() -> TrendAnalysisResponse:
    """Search the live web for white papers, bottleneck/technology analyses
    and market-disruption coverage, and return Claude's structured read of
    what it actually found.

    Real-time, web-search-backed — not mock data. Raises ValueError for
    anything that should surface to the user as a 502 (missing API key,
    a failed API call, malformed model output).
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "ניתוח מגמות אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            # 4096 was too low here: this call does live web_search *and*
            # asks for several trends, each with a long details_he (5-8
            # sentences) — real runs were hitting the token cap mid-JSON,
            # so json.loads() failed on the truncated output and the user
            # saw "הניתוח שהתקבל אינו בפורמט תקין" (this is the bug the
            # user reported — not an API-key/credits problem). Bumped to
            # match the token budget already used by this file's other
            # long, web-search-backed JSON responses (weekly summaries use
            # 10000-16000; this one's output is smaller, so 8000 is ample
            # headroom without over-provisioning).
            max_tokens=8000,
            system=TREND_ANALYSIS_SYSTEM_PROMPT,
            tools=[WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "חפשו באינטרנט ואתרו כרגע: white papers חדשים שפרסמו חברות "
                        "טכנולוגיה/AI/תשתיות גדולות, ניתוחים של צווארי בקבוק "
                        "טכנולוגיים או בשרשרת האספקה, טכנולוגיות חדשות משמעותיות, "
                        "וכתבות/ניתוחים על market disruption בסקטורים רלוונטיים. "
                        "לאחר החיפוש, החזירו אך ורק אובייקט JSON תקין לפי ההנחיות "
                        "במערכת."
                    ),
                }
            ],
        )
    except Exception as exc:  # network/auth/rate-limit errors from the SDK
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)

    try:
        return TrendAnalysisResponse.model_validate(data)
    except Exception as exc:  # pydantic ValidationError
        raise ValueError("הניתוח שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc


PRICE_MOVE_SYSTEM_PROMPT = """אתה אנליסט שוק בקרן גידור. תפקידך להסביר בקצרה, בעברית, מדוע מניה מסוימת נעה משמעותית ביום המסחר הנוכחי. יש לך גישה לכלי חיפוש אינטרנט (web_search) - השתמש בו בפועל כדי למצוא את החדשות/הנתונים/ההודעות הרלוונטיות שיכולות להסביר את התנועה (דוח כספי, הודעת החברה, שדרוג/הורדת דירוג של אנליסטים, חדשות סקטוריאליות, נתוני מאקרו וכו').

ההסבר חייב:
- להיות בעברית, 2-4 משפטים בלבד.
- להתבסס על מה שנמצא בפועל בחיפוש - אם לא נמצאה סיבה ספציפית וברורה, ציינו זאת במפורש (למשל: "לא נמצאה סיבה ספציפית שמסבירה את התנועה - ייתכן שזו תנודתיות שוק כללית") ואל תמציאו הסבר.
- להתמקד בגורם/גורמים הישירים ביותר, לא בסקירה כללית של החברה.

החזירו אך ורק אובייקט JSON תקין (ללא markdown) במבנה: {"explanation_he": "ההסבר כאן"}"""


def explain_price_move(ticker: str, change_pct: float) -> str:
    """Bot feature "התראות מותאמות אישית": for a price-move alert the
    frontend already detected (from the portfolio's own daily change,
    since there's no server-side price feed — see app/services/alerts.py),
    find the real reason for that move via a live web search.

    Real web-search-backed answer — not mock data, same declared exception
    as the rest of the bot.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "הסבר לתנועת המניה אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    direction_he = "עלתה" if change_pct >= 0 else "ירדה"
    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=1024,
            system=PRICE_MOVE_SYSTEM_PROMPT,
            tools=[WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"המניה {ticker} {direction_he} {abs(change_pct):.1f}% היום. "
                        "חפשו באינטרנט ומצאו את הסיבה הסבירה ביותר לתנועה הזו, "
                        "והחזירו אך ורק אובייקט JSON תקין לפי ההנחיות במערכת."
                    ),
                }
            ],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)
    explanation = data.get("explanation_he")
    if not isinstance(explanation, str) or not explanation.strip():
        raise ValueError("ההסבר שהתקבל אינו תקין — נסו שוב")
    return explanation


ECONOMIC_TRENDS_SYSTEM_PROMPT = """אתה כלכלן ראשי (Chief Economist) בקרן גידור, שמנתח בזמן אמת מה משפיע על הכלכלה והשווקים האמריקאיים ולאן הם צפויים להתקדם. יש לך גישה לכלי חיפוש אינטרנט (web_search) - השתמש בו בפועל כדי לאתר נתונים ואירועים כלכליים עדכניים: פרסומי נתוני מאקרו (אבטלה, ייצור תעשייתי, צמיחת תמ"ג, אינפלציה, מכירות קמעונאיות וכו'), החלטות/הצהרות של הפדרל ריזרב, מדדי סנטימנט צרכנים, ותחזיות/ניתוחים עדכניים על כיוון השוק והכלכלה האמריקאית.

חובה:
- לבצע חיפושי אינטרנט אמיתיים באמצעות הכלי לפני מתן תשובה - אל תסתמך רק על ידע קודם, ובפרט אל תניח נתונים ישנים כאילו הם עדכניים.
- להתבסס אך ורק על מה שנמצא בפועל בחיפושים - לעולם אל תמציא נתונים, מספרים או מקורות.
- הפלט כולו בעברית.
- להתייחס במפורש למצב הצרכן האמריקאי ולפחות למספר אינדיקטורים כלכליים קונקרטיים (כגון אבטלה, ייצור, צמיחה) עם המספרים העדכניים שנמצאו.

לאחר שסיימת לחפש, החזר את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "generated_at_he": "תיאור תקופת הניתוח, לדוגמה: ספטמבר 2026",
  "market_direction": "bullish | bearish | neutral - הערכה כוללת לכיוון השוק בטווח הקרוב",
  "overview_he": "2-3 משפטים המסכמים את התמונה הכוללת שעלתה מהחיפוש",
  "consumer_sentiment_he": "2-3 משפטים על מצב הצרכן האמריקאי, מבוסס על נתוני סנטימנט/הוצאה שנמצאו",
  "key_indicators": [
    {"name_he": "שם האינדיקטור, לדוגמה: שיעור אבטלה", "value_he": "הערך העדכני שנמצא, עם תאריך הפרסום", "trend": "positive | negative | neutral", "commentary_he": "פרשנות קצרה"}
  ],
  "macro_drivers_he": ["גורם מרכזי שמשפיע כרגע על הכלכלה/השוק, עם הסבר קצר"],
  "outlook_he": "2-4 משפטים על לאן השוק והכלכלה האמריקאית צפויים להתקדם, לפי מה שנמצא בחיפושים",
  "risks_he": ["סיכון מרכזי לתרחיש שתואר"],
  "sources": [{"title": "כותרת מקור", "url": "כתובת URL"}]
}

כל item ברשימות צריך להיות תמציתי - עד 2-3 משפטים. אל תחזיר שום דבר מחוץ לאובייקט ה-JSON."""


def analyze_economy() -> EconomicTrendsResponse:
    """Search the live web for current US macro data, Fed commentary and
    consumer-sentiment coverage, and return Claude's structured read of
    where the economy/market appear to be heading.

    Real-time, web-search-backed — not mock data. Raises ValueError for
    anything that should surface to the user as a 502 (missing API key,
    a failed API call, malformed model output).
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "ניתוח מגמות כלכלה אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            # Same fix as analyze_trends() above (CLAUDE.md entry 58) —
            # this is also a web_search-backed, multi-item detailed-JSON
            # response that could get truncated mid-JSON at 4096 tokens.
            max_tokens=8000,
            system=ECONOMIC_TRENDS_SYSTEM_PROMPT,
            tools=[WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "חפשו באינטרנט ואתרו כרגע: נתוני מאקרו כלכליים עדכניים "
                        "בארה\"ב (אבטלה, ייצור, צמיחה, אינפלציה), עמדת/הצהרות "
                        "הפדרל ריזרב האחרונות, מדדי סנטימנט צרכנים, ותחזיות "
                        "עדכניות לכיוון השוק והכלכלה. לאחר החיפוש, החזירו אך ורק "
                        "אובייקט JSON תקין לפי ההנחיות במערכת."
                    ),
                }
            ],
        )
    except Exception as exc:  # network/auth/rate-limit errors from the SDK
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)

    try:
        return EconomicTrendsResponse.model_validate(data)
    except Exception as exc:  # pydantic ValidationError
        raise ValueError("הניתוח שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc


def _read_economic_trends_cache() -> EconomicTrendsResponse | None:
    """Return the cached result if the file exists and is still fresh
    (younger than ECONOMIC_TRENDS_CACHE_TTL), else None. Any read/parse
    problem is treated the same as "no cache" — this is a best-effort
    optimization, never something that should fail the request.
    """
    if not ECONOMIC_TRENDS_CACHE_PATH.exists():
        return None
    try:
        raw = json.loads(ECONOMIC_TRENDS_CACHE_PATH.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(raw["cached_at_iso"])
        if datetime.now(timezone.utc) - cached_at > ECONOMIC_TRENDS_CACHE_TTL:
            return None
        return EconomicTrendsResponse.model_validate(raw)
    except Exception:
        return None


def _write_economic_trends_cache(result: EconomicTrendsResponse) -> None:
    """Best-effort write — a failure here (e.g. read-only filesystem)
    should never break the response the user is about to get back.
    """
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        ECONOMIC_TRENDS_CACHE_PATH.write_text(
            json.dumps(result.model_dump(), ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def get_economic_trends(force_refresh: bool = False) -> EconomicTrendsResponse:
    """Public entry point for the "מגמות כלכלה" bot feature: serves the
    cached result when it's less than a week old, otherwise (or when
    `force_refresh` is set, e.g. a "רענן עכשיו" click) runs a fresh
    web-search-backed analyze_economy() call and refreshes the cache.
    """
    if not force_refresh:
        cached = _read_economic_trends_cache()
        if cached is not None:
            return cached

    result = analyze_economy()
    cached_at_iso = datetime.now(timezone.utc).isoformat()
    result = result.model_copy(update={"cached_at_iso": cached_at_iso})
    _write_economic_trends_cache(result)
    return result


# --- "בניית תזה" — deep equity-research thesis builder -----------------------
# This one needs a lot more live research than the other bot features
# (business model, technology/product detail, market size, competitors,
# customer concentration, current financials + forward guidance, order
# backlog, recent catalysts) to reach the depth of a real fund analyst's
# write-up, so it gets its own web-search budget (more calls allowed) and
# a much larger output budget (max_tokens) than the shorter bot features.
# max_tokens is set well above the other bot features' budgets: on top of
# the original sections, the thesis now also covers the business model, an
# overall competitive-advantage/moat analysis and two revenue-mix
# breakdowns (by segment, by geography), and the user explicitly asked for
# longer, more expansive prose in every section.
THESIS_WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 20,
}

THESIS_SYSTEM_PROMPT = """אתה אנליסט בכיר בקרן גידור, שכותב תזות השקעה מעמיקות ואישיות למניה בודדת ברמה הגבוהה ביותר - בדיוק כמו תזה שאנליסט מוביל היה מכין למנהל תיקים לפני שהוא לוקח פוזיציה משמעותית. יש לך גישה לכלי חיפוש אינטרנט (web_search) - השתמש בו בפועל ובהרחבה (הרבה חיפושים, לא רק אחד או שניים) כדי לאסוף מידע עדכני ואמיתי: מודל העסקי והטכנולוגיה/מוצר של החברה, גודל השוק והלקוחות שלה, מתחרים עיקריים והיתרון התחרותי (חפיר) של החברה, הנתונים הכספיים העדכניים ביותר (הכנסות, שולי רווח, מאזן, תחזיות), תחזית ארוכת טווח שהחברה עצמה נתנה אם קיימת, צבר הזמנות אם רלוונטי, וקטליזטורים קרובים (הכרזות, השקות מוצר, הרחבות ייצור וכו').

**חשוב מאוד - התאמת הפורמט לסקטור:** אל תכפו מבנה של חברת טכנולוגיה/חומרה על כל חברה. השתמשו בשדה "segments" בצורה שמתאימה לסקטור בפועל - עבור חברת שבבים/חומרה אלו יכולים להיות קווי מוצר, עבור בנק זה יכול להיות פילוח לפי תיק אשראי/פיקדונות/עמלות, עבור חברת ביוטק זה יכול להיות צנרת התרופות (pipeline) לפי שלב פיתוח, עבור קמעונאות זה יכול להיות פילוח לפי ערוצי מכירה/גיאוגרפיה, וכן הלאה. התוכן והמינוח בכל השדות (לא רק segments) צריכים להתאים לאופי הסקטור והמדדים הרלוונטיים לו (למשל: בנק - NIM, יחס הון; ביוטק - שלבי ניסויים קליניים, תאריכי החלטת FDA; קמעונאות - same-store sales; SaaS - NRR, ARR).

**מודל עסקי (business_model_he):** שדה נפרד מ-business_overview_he - כאן התמקדו במנגנון שבו החברה בפועל מרוויחה כסף: איך נראית מכירה טיפוסית (חד-פעמית/חוזית/מנוי/רישיון), מי המשלם בפועל, מבנה התמחור, אורך מחזור המכירה, שיעור ההכנסות החוזרות (recurring) אם רלוונטי, ומבנה העלויות המרכזי (למשל capex כבד מול מודל asset-light). היו קונקרטיים ומספריים ככל שניתן.

**יתרון תחרותי כולל של החברה (competitive_advantage_he):** בנוסף ל-competitive_edge_he הפר-פילוח, כתבו כאן ניתוח חפיר (moat) ברמת החברה כולה - מהו מקור היתרון (טכנולוגיה/פטנטים, אפקט רשת, עלויות מעבר ללקוח switching costs, יתרון עלות/קנה מידה, מותג, רגולציה/רישיונות), עד כמה הוא בר-קיימא לאורך זמן, ואיך הוא בא לידי ביטוי מול המתחרים שהוזכרו ב-competitive_landscape_he. לפחות 4-6 משפטים.

**תמהיל הכנסות (revenue_mix_by_segment, revenue_mix_by_geography):** חפשו בפירוש את הפילוח שהחברה עצמה מדווחת עליו (בדוחות הכספיים/מצגות למשקיעים) - הן לפי מוצר/חטיבה והן לפי אזור גיאוגרפי (למשל ארה"ב/אירופה/אסיה, או צפון אמריקה/EMEA/APAC, בהתאם למה שהחברה בפועל מדווחת). לכל פריט תנו label_he ו-pct_he (אחוז בפועל אם דווח, למשל "38%" או "כ-45%"). אם פילוח גיאוגרפי (או פילוח לפי מוצר) לא מפורסם בנפרד על ידי החברה, אל תמציאו מספרים - החזירו רשימה עם פריט אחד שאומר זאת בפירוש (למשל label_he: "לא מפורסם בנפרד", pct_he: "-", note_he: "החברה אינה מפרסמת פילוח גיאוגרפי בדוחותיה"). דיוק ואמינות חשובים כאן יותר מהצגת מספרים "יפים".

הטון צריך להיות אישי ובעל ביטחון עצמי, כמו של אנליסט שבאמת חושב על התזה הזאת ולא רק מסכם נתונים - "למה אני חושב שהחברה רלוונטית", "התרחיש שאני רואה כסביר ביותר", וכו', אבל תמיד מבוסס על נתונים אמיתיים שנמצאו בחיפוש, לא המצאות.

**אורך ורמת פירוט - זו תזה ברמה הגבוהה ביותר, לא תקציר:** כל שדה טקסט חופשי (לא כותרות/מספרים) צריך להיות פסקה מלאה ומפורטת, לא משפט או שניים. כאשר מצוין מינימום משפטים בתיאור השדה למטה, התייחסו אליו כרף תחתון בלבד - שאפו לרוב לחרוג ממנו. אל תחסכו במילים כדי "להספיק" - העדיפו תזה ארוכה, עשירה ומבוססת-נתונים על פני תזה קצרה. כל פילוח (segment) צריך תיאור מלא ולא משפט אחד. ביבליוגרפיית המקורות (sources) צריכה לכלול לפחות 6-10 מקורות אמיתיים מתוך מה שנמצא בחיפוש.

**חישוב "מחשבון סנדלרים" (back-of-envelope valuation):** בשדה back_of_envelope_valuation_he הציגו חישוב שווי פשוט וברור, בנוי על הדרך הזו: קחו יעד/תחזית הכנסות ארוכת טווח (של החברה עצמה אם ניתנה, או הערכה סבירה), הפחיתו ממנו את ההכנסות הנוכחיות כדי לקבל את תוספת ההכנסות הצפויה, הכפילו בהנחת שולי רווח נקי סבירה כדי לקבל תוספת רווח נקי, הכפילו במכפיל רווח (P/E) סביר להנחה כדי לקבל תוספת שווי שוק, והשוו לשווי השוק הנוכחי כדי לקבל את פוטנציאל האפסייד באחוזים. הציגו את כל השלבים והמספרים בפירוש, לא רק את התוצאה הסופית.

**שלושה תרחישי הערכת שווי (valuation_scenarios):** בנו תרחיש דובי (bear), בסיס (base) ושורי (bull), כל אחד עם מכפיל רווח שונה (הדובי הנמוך ביותר, השורי הגבוה ביותר) והנחות שונות לגבי מה צריך לקרות כדי שהתרחיש יתממש (לדוגמה: האם יש הרחבת ייצור, זכייה בחוזים חדשים, שיפור/הרעה בשולי רווח, כניסה לשווקים חדשים וכו') - בהתאמה לאופי הסקטור.

החזירו את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "ticker": "הטיקר, אותיות גדולות",
  "company_name": "שם החברה המלא",
  "sector_he": "הסקטור/תת-הסקטור שהחברה פועלת בו",
  "generated_at_he": "לדוגמה: ספטמבר 2026, לפי נתונים עדכניים שנמצאו בחיפוש",
  "business_overview_he": "רקע על החברה - מה היא עושה, ההיסטוריה שלה אם רלוונטי (מייסדים, שנת הקמה), ובעיקר הבעיה/הצורך העסקי שהיא פותרת ואיך - 4-6 משפטים לפחות",
  "business_model_he": "איך החברה בפועל מרוויחה כסף - מבנה המכירה, התמחור, מי המשלם, הכנסות חוזרות מול חד-פעמיות, מבנה עלויות - פסקה מלאה, 4-6 משפטים לפחות",
  "core_thesis_he": "לב התזה - למה החברה רלוונטית, מה השוק מפספס לדעתכם, למה עכשיו - זהו הקטע המרכזי והאישי ביותר, 5-8 משפטים לפחות",
  "catalysts_he": ["קטליזטור קרוב 1 עם פירוט", "קטליזטור 2", "..."],
  "segments": [{"name_he": "שם הפילוח/מוצר/חטיבה (מותאם לסקטור)", "description_he": "תיאור מפורט", "competitive_edge_he": "היתרון התחרותי הספציפי בפילוח הזה, אם רלוונטי"}],
  "competitive_advantage_he": "ניתוח החפיר (moat) ברמת החברה כולה - מקור היתרון, בר-קיימותו, ואיך הוא בא לידי ביטוי מול המתחרים - 4-6 משפטים לפחות",
  "revenue_mix_by_segment": [{"label_he": "שם המוצר/חטיבה", "pct_he": "האחוז מסך ההכנסות כפי שדווח, או '-' אם לא מפורסם", "note_he": "הערה חופשית, למשל אם המספר משוער"}],
  "revenue_mix_by_geography": [{"label_he": "שם האזור הגיאוגרפי", "pct_he": "האחוז מסך ההכנסות כפי שדווח, או '-' אם לא מפורסם", "note_he": "הערה חופשית"}],
  "market_and_customers_he": "גודל השוק המוערך, פילוח הלקוחות/הסקטורים שהחברה מוכרת אליהם, וניתוח ריכוזיות לקוחות/סיכון תלות בלקוח גדול אם קיים",
  "competitive_landscape_he": "מיפוי המתחרים העיקריים ולמה החברה מנצחת/מפסידה מולם",
  "financials": {
    "revenue_current_he": "הכנסות בשנה הנוכחית/האחרונה שדווחה, עם קצב הצמיחה",
    "revenue_next_year_he": "תחזית הכנסות לשנה הבאה, אם קיימת",
    "gross_margin_he": "שולי רווח גולמי",
    "operating_margin_he": "שולי רווח תפעולי",
    "net_margin_he": "שולי רווח נקי",
    "balance_sheet_he": "מצב המאזן - מזומן, חוב, איתנות פיננסית",
    "guidance_he": "תחזית ארוכת טווח שהחברה עצמה נתנה, אם קיימת",
    "narrative_he": "פסקה שמסכמת את התמונה הכספית הכוללת"
  },
  "back_of_envelope_valuation_he": "חישוב השווי המפורט לפי המתודולוגיה שהוסברה למעלה, עם כל השלבים והמספרים",
  "valuation_scenarios": [
    {"label": "bear", "multiple_used_he": "המכפיל שנבחר ולמה", "assumptions_he": "מה קורה בתרחיש הזה", "implied_outcome_he": "התוצאה המשתמעת - יעד מחיר/שווי/אפסייד-דאונסייד"},
    {"label": "base", "multiple_used_he": "...", "assumptions_he": "...", "implied_outcome_he": "..."},
    {"label": "bull", "multiple_used_he": "...", "assumptions_he": "...", "implied_outcome_he": "..."}
  ],
  "author_view_he": "הדעה האישית שלכם - איזה תרחיש הכי סביר לדעתכם ולמה, בטון של אנליסט עם דעה",
  "risks_to_thesis_he": ["סיכון מרכזי 1 לתזה", "סיכון 2", "..."],
  "sources": [{"title": "כותרת המקור", "url": "https://..."}]
}

היו מפורטים ומעמיקים בכל שדה טקסט - זו תזה מקצועית ולא תקציר שטחי. אל תחזירו שום דבר מחוץ לאובייקט ה-JSON."""


def build_equity_thesis(ticker: str) -> EquityThesisResponse:
    """"בניית תזה": search the ticker deeply and produce a full
    hedge-fund-style investment thesis — business overview, the business
    model, the core argument, catalysts, a sector-appropriate segment
    breakdown, the company's overall competitive advantage (moat),
    revenue-mix breakdowns by segment and by geography, market/competitive
    context, financials, a back-of-envelope valuation calculation,
    bear/base/bull scenarios, the author's own view and the main risks.

    Real, web-search-backed Claude call — not mock data, same declared
    exception as the rest of the bot.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "בניית תזה אינה זמינה כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    ticker_clean = ticker.strip().upper()
    if not ticker_clean:
        raise ValueError("נא להזין טיקר")

    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=16000,
            system=THESIS_SYSTEM_PROMPT,
            tools=[THESIS_WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"בנו תזת השקעה מעמיקה ומקצועית עבור המניה {ticker_clean}. "
                        "חפשו באינטרנט בהרחבה כדי לאסוף את כל המידע הדרוש - מודל "
                        "עסקי, נתונים כספיים עדכניים, מתחרים, גודל שוק, קטליזטורים "
                        "וכל מידע רלוונטי נוסף. התאימו את מבנה התזה לאופי הסקטור "
                        "הספציפי של החברה. לאחר החיפוש, החזירו אך ורק אובייקט JSON "
                        "תקין לפי ההנחיות במערכת."
                    ),
                }
            ],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)

    try:
        return EquityThesisResponse.model_validate(data)
    except Exception as exc:
        raise ValueError("התזה שהתקבלה אינה תואמת למבנה הצפוי — נסו שוב") from exc


# --- "סיכום שבועי" — per-market weekly market recap + outlook ---------------
# The user picks one of four markets and gets a structured weekly recap:
# index returns, 10y/30y bond yields where relevant, the economic-data
# releases that came out this week (and whether they beat/missed), a
# narrative of what actually moved the market and why, and a forward look
# at next week (what economic data + company earnings to watch). Field
# names/shape stay identical across markets (same pattern as the thesis
# builder's sector-agnostic schema) — only the *content* changes per
# market, guided by the per-market hints below.
#
# Cached per-market on disk for a day at a time: shorter than the
# economic-trends cache (a week), because a "what happened this week"
# recap needs to keep picking up new developments as the week
# progresses, not just refresh once a week like slower-moving macro
# data. `force_refresh=True` (a "רענן עכשיו" click) bypasses the cache.
WEEKLY_SUMMARY_CACHE_TTL = timedelta(days=1)


def _weekly_summary_cache_path(market_id: str) -> Path:
    return CACHE_DIR / f"weekly_summary_cache_{market_id}.json"


WEEKLY_SUMMARY_WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 12,
}

# Per-market hints for what "the major indices", "the relevant bond
# yields" and "the relevant economic data" actually mean in that market —
# the JSON shape returned is identical across all four; only the content
# and terminology should adapt, same principle as the thesis builder.
WEEKLY_SUMMARY_MARKETS: dict[str, dict[str, str]] = {
    "israel": {
        "label_he": "שוק ישראלי",
        "guidance_he": (
            "מדדים מרכזיים: ת\"א 35, ת\"א 125, ת\"א בנקים, ת\"א נדל\"ן (או מדדים "
            "רלוונטיים אחרים שהיו בולטים השבוע). תשואות אג\"ח ממשלתי שקלי "
            "ל-10 שנים (ואם קיים גם ל-30 שנה) וצמוד מדד, ושער החליפין "
            "שקל/דולר אם רלוונטי לתמונה. נתוני מאקרו ישראליים: החלטת ריבית "
            "בנק ישראל, מדד המחירים לצרכן, נתוני אבטלה/תעסוקה, ומדדי "
            "אמון הצרכנים/העסקים."
        ),
    },
    "us": {
        "label_he": 'שוק ארה"ב (כולל קריפטו)',
        "guidance_he": (
            'מדדים מרכזיים: S&P 500, Nasdaq 100, Dow Jones, Russell 2000. '
            "תשואות אג\"ח ממשלת ארה\"ב ל-10 שנים ול-30 שנה (ברמה ובשינוי "
            "השבועי בנקודות בסיס). **כללו גם ביטקוין (BTC) ואת'ריום (ETH) "
            "כשורות נפרדות ברשימת index_returns**, עם התשואה השבועית שלהם "
            "וסיבה קצרה לתנועה אם ידועה - זה חלק חובה מהתשואות המבוקשות, "
            "לא תוספת אופציונלית. נתוני מאקרו: מדד המחירים לצרכן (CPI), "
            "תביעות אבטלה, דוח התעסוקה החודשי (NFP), והחלטת ריבית הפד אם "
            "התקיימה השבוע (כולל טון מסיבת העיתונאים אם רלוונטי)."
        ),
    },
    "asia": {
        "label_he": "שווקי אסיה",
        "guidance_he": (
            "מדדים מרכזיים: Nikkei 225 (יפן), Hang Seng (הונג קונג), "
            "CSI 300/Shanghai Composite (סין), KOSPI (קוריאה), Nifty 50 "
            "(הודו) - כללו את אלה שהיו הכי רלוונטיים/בעלי התנועה המשמעותית "
            "ביותר השבוע, לא בהכרח את כולם. תשואות אג\"ח ממשלתי יפני/סיני "
            "ל-10 שנים אם יש בהן תנועה מדווחת ומשמעותית השבוע; אם לא נמצא "
            "מידע אמין, ציינו זאת ב-bond_yields_note_he במקום להמציא "
            "מספרים. נתוני מאקרו: PMI סיני, נתוני צמיחה/יצוא של סין/יפן/"
            "קוריאה, והחלטות ריבית של בנקים מרכזיים באזור אם היו השבוע."
        ),
    },
    "commodities": {
        "label_he": "שוק הסחורות",
        "guidance_he": (
            "נכסים מרכזיים: נפט (WTI ו-Brent), זהב, כסף, נחושת, גז טבעי, "
            "וסחורה חקלאית מרכזית נוספת אם הייתה לה תנועה משמעותית השבוע - "
            "כל אחד כשורה נפרדת ב-index_returns עם התשואה השבועית שלו. "
            "תשואות אג\"ח (bond_yields) בדרך כלל לא רלוונטיות ישירות לשוק "
            "הסחורות - אם כך, החזירו רשימה ריקה וציינו זאת בבירור "
            "ב-bond_yields_note_he במקום להמציא נתון לא רלוונטי. נתוני "
            "מאקרו: דוח מלאי הנפט השבועי (EIA), החלטות/הכרזות OPEC+, "
            "נתוני ביקוש מסין, ואירועי מזג אוויר/גיאופוליטיקה שהשפיעו על "
            "המחירים."
        ),
    },
}

WEEKLY_SUMMARY_SYSTEM_PROMPT = """אתה אסטרטג שווקים בכיר בקרן גידור, שכותב סיכום שבועי חד וברמה גבוהה לשוק ספציפי אחד, בדיוק כמו הסיכום שאסטרטג היה מכין למנהלי תיקים בתחילת כל שבוע מסחר. יש לך גישה לכלי חיפוש אינטרנט (web_search) - השתמשו בו בפועל כדי לאתר את הנתונים העדכניים ביותר: תשואות המדדים המרכזיים בשבוע האחרון, רמות ושינויי תשואות אג\"ח רלוונטיות, תוצאות הפרסומים הכלכליים שהיו השבוע (בפועל מול הצפי), החדשות/האירועים שהזיזו את השוק, והיומן הכלכלי/דוחות החברות הצפויים בשבוע הקרוב.

**חשוב - מיקוד בשוק הספציפי בלבד:** אתם כותבים על שוק אחד בלבד לפי מה שצוין בבקשת המשתמש. אל תערבבו נתונים משווקים אחרים מעבר להקשר קצר אם ממש נדרש (למשל השפעת הפד על שווקים אחרים). התאימו את המדדים, נכסי הבסיס, האג\"ח ונתוני המאקרו למה שרלוונטי בפועל לשוק הזה - לא כל שדה חייב להיות מלא באותו אופן בכל שוק (למשל שוק הסחורות לרוב לא צריך תשואות אג\"ח).

**דיוק על פני שלמות מדומה:** אם נתון מסוים (למשל תשואת אג\"ח ספציפית באסיה, או פילוח מדויק) לא נמצא במקורות אמינים בחיפוש, אל תמציאו אותו - השאירו רשימה ריקה או ציינו זאת בפירוש בשדה ההערה הרלוונטי (bond_yields_note_he). אמינות חשובה יותר מהצגת טבלה "מלאה".

**מבנה הניתוח (מפורט ומעמיק — לא תמצית שטחית):**
- summary_he: פסקת פתיחה שמתמצתת את השבוע כולו במשפטים ספורים - התמונה הכללית.
- index_returns: תשואות המדדים/נכסי הבסיס המרכזיים של השוק הזה בשבוע האחרון (ראו הנחיה ספציפית לשוק).
- bond_yields: תשואות אג\"ח רלוונטיות (10/30 שנה) אם רלוונטי לשוק הזה; ריק + bond_yields_note_he אם לא. **לכל שורת תשואה חובה למלא market_impact_he** - פסקה קצרה (2-3 משפטים) שמסבירה את מנגנון ההשפעה בפועל על שוק המניות: למשל איך עליית תשואת ה-10 שנים מייקרת את שיעור ההיוון למניות צמיחה ולוחצת על המכפילים שלהן, או איך ירידת תשואות מקלה את תנאי המימון ותומכת בסנטימנט הכללי. זה לא "התשואה עלתה" אלא "התשואה עלתה, ובגלל X זה משפיע על Y בשוק המניות".
- economic_data_results: הפרסומים הכלכליים שהיו השבוע בפועל, עם תוצאה בפועל מול הצפי (ואם היה זה הפתעה משמעותית, הסבירו קצר ב-surprise_he). **לכל פרסום חובה למלא impact_he** - פסקה קצרה (2-3 משפטים) שמסבירה מה הנתון הספציפי הזה (הכה/החטיא/היה בקו עם הצפי) אומר בפועל על מצב הכלכלה ועל ציפיות המדיניות המוניטרית - למשל אינפלציה חמה יותר מהצפוי שמעלה את הסיכוי שהבנק המרכזי ישאיר ריבית גבוהה לאורך זמן, או נתוני תעסוקה חלשים שמגבירים ציפיות להורדת ריבית.
- market_narrative_he: מה קרה בפועל בשוק השבוע - פסקה מפורטת, לא רק רשימת נתונים אלא סיפור של השבוע.
- why_moved_he: ניתוח ממוקד וברור מדוע השוק עלה/ירד השבוע - הגורם/גורמים המרכזיים שהניעו את התנועה.
- outlook_next_week_he: לאן השוק צפוי ללכת בשבוע הקרוב ומה חשוב לדעת - בטון של אסטרטג עם דעה, אך מבוסס על מה שבאמת ידוע (אירועים מתוכננים, תמחור שוק החוזים וכו').
- key_economic_events_ahead: רשימת האירועים/פרסומים הכלכליים החשובים ביותר בשבוע הקרוב, **כל אחד עם תאריך/יום ספציפי (date_he, למשל "יום רביעי, 24/09")** - לא רק שם האירוע, וברוב הפריטים גם why_it_matters_he קצר שמסביר למה האירוע הזה חשוב לשוק. אירוע כלכלי מאקרו כללי (למשל החלטת ריבית) בדרך כלל אין לו טיקר בודד - השאירו ticker כ-null במקרה כזה.
- key_earnings_ahead: רשימת דיווחי החברות המשמעותיים ביותר הצפויים בשבוע הקרוב (אם רלוונטי לשוק הזה - למשל פחות רלוונטי לסחורות), **גם כן כל אחד עם date_he ספציפי** (תאריך הדיווח הצפוי) ו-why_it_matters_he קצר במידת האפשר. **חובה למלא ticker** (סימול המניה, לדוגמה "NVDA") לכל דיווח חברה בודדת - לא רק את שם החברה בעברית ב-label_he. **אם רשימת הטיקרים שבתיק המשתמש שסופקה לכם (ראו בהודעת המשתמש) כוללת את הטיקר הזה, סמנו is_portfolio_holding כ-true** - זה מאפשר להציג למשתמש בבירור אילו מהדיווחים הקרובים נוגעים למניות שהוא בפועל מחזיק. אם לא סופקה רשימת תיק, או שהטיקר לא בה, השאירו is_portfolio_holding כ-false.

היו מפורטים ומעמיקים - זהו סיכום מקצועי ולא תמצית שטחית. החזירו את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "market_id": "israel | us | asia | commodities - בדיוק כפי שצוין בבקשה",
  "market_label_he": "שם השוק בעברית",
  "week_range_he": "טווח התאריכים של השבוע שמסוכם, לדוגמה: 15-19 בספטמבר 2026",
  "generated_at_he": "לדוגמה: ספטמבר 2026",
  "summary_he": "פסקת הפתיחה",
  "index_returns": [{"name_he": "שם המדד/הנכס", "return_pct_he": "התשואה השבועית, לדוגמה +1.8%"}],
  "bond_yields": [{"label_he": "שם האג\"ח", "yield_level_he": "הרמה הנוכחית", "weekly_change_he": "השינוי השבועי בנקודות בסיס", "market_impact_he": "פסקה קצרה על מנגנון ההשפעה על שוק המניות"}],
  "bond_yields_note_he": "הערה אם תשואות אג\"ח לא רלוונטיות/לא נמצאו לשוק הזה, אחרת null",
  "economic_data_results": [{"label_he": "שם הפרסום", "actual_he": "התוצאה בפועל", "expected_he": "הצפי", "previous_he": "הנתון הקודם", "surprise_he": "הסבר אם הייתה הפתעה משמעותית, אחרת null", "impact_he": "פסקה קצרה על המשמעות הכלכלית/המדיניות של הנתון הזה"}],
  "market_narrative_he": "פסקה מפורטת",
  "why_moved_he": "ניתוח הגורמים לתנועה",
  "outlook_next_week_he": "התחזית לשבוע הקרוב",
  "key_economic_events_ahead": [{"date_he": "יום רביעי, 24/09", "label_he": "אירוע כלכלי קרוב 1", "why_it_matters_he": "למה זה חשוב", "ticker": null, "is_portfolio_holding": false}],
  "key_earnings_ahead": [{"date_he": "יום חמישי, 25/09 (אחרי נעילת המסחר)", "label_he": "דוח חברה חשוב קרוב 1 (NVDA)", "why_it_matters_he": "למה זה חשוב", "ticker": "NVDA", "is_portfolio_holding": true}],
  "sources": [{"title": "כותרת המקור", "url": "https://..."}]
}

אל תחזירו שום דבר מחוץ לאובייקט ה-JSON."""


def analyze_weekly_summary(
    market_id: str, portfolio_tickers: list[str] | None = None
) -> WeeklySummaryResponse:
    """Search the live web and produce a structured weekly recap +
    forward outlook for the given market.

    `portfolio_tickers` (optional): the user's current portfolio tickers,
    passed through so the model can flag any upcoming earnings report that
    matches a holding the user actually has (WeeklySummaryUpcomingItem.
    is_portfolio_holding). Portfolio holdings are client-side only, so the
    frontend must supply this list — see WeeklySummaryRequest.

    Real, web-search-backed Claude call — not mock data, same declared
    exception as the rest of the bot.
    """
    if market_id not in WEEKLY_SUMMARY_MARKETS:
        raise ValueError(
            f"שוק לא מוכר: {market_id} — יש לבחור אחד מ: "
            + ", ".join(WEEKLY_SUMMARY_MARKETS)
        )
    if not settings.anthropic_api_key:
        raise ValueError(
            "סיכום שבועי אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    market_config = WEEKLY_SUMMARY_MARKETS[market_id]
    client = Anthropic(api_key=settings.anthropic_api_key)

    portfolio_tickers = [t.strip().upper() for t in (portfolio_tickers or []) if t.strip()]
    portfolio_note_he = (
        f"רשימת הטיקרים שבתיק המשתמש כרגע (לצורך סימון is_portfolio_holding "
        f"בדיווחי חברות קרובים בלבד, לא לצורך שינוי שאר הניתוח): {', '.join(portfolio_tickers)}."
        if portfolio_tickers
        else "לא סופקה רשימת תיק למשתמש הזה - השאירו is_portfolio_holding כ-false בכל הפריטים."
    )

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=10000,
            system=WEEKLY_SUMMARY_SYSTEM_PROMPT,
            tools=[WEEKLY_SUMMARY_WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"הכינו סיכום שבועי מקצועי עבור {market_config['label_he']} "
                        f"(market_id: \"{market_id}\"). {market_config['guidance_he']} "
                        "חפשו באינטרנט כדי לאתר את הנתונים העדכניים ביותר על השבוע "
                        "שהסתיים זה עתה, ואת האירועים/דוחות הצפויים בשבוע הקרוב. "
                        f"{portfolio_note_he} "
                        "לאחר החיפוש, החזירו אך ורק אובייקט JSON תקין לפי ההנחיות "
                        "במערכת, עם market_id בדיוק כפי שצוין כאן."
                    ),
                }
            ],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)
    data["market_id"] = market_id  # guard against the model drifting off the requested id
    data.setdefault("market_label_he", market_config["label_he"])

    try:
        return WeeklySummaryResponse.model_validate(data)
    except Exception as exc:
        raise ValueError("הסיכום שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc


def _read_weekly_summary_cache(market_id: str) -> WeeklySummaryResponse | None:
    """Same best-effort file cache pattern as the economic-trends cache,
    just keyed per market and with a much shorter TTL (see the module
    comment above)."""
    path = _weekly_summary_cache_path(market_id)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(raw["cached_at_iso"])
        if datetime.now(timezone.utc) - cached_at > WEEKLY_SUMMARY_CACHE_TTL:
            return None
        return WeeklySummaryResponse.model_validate(raw)
    except Exception:
        return None


def _write_weekly_summary_cache(market_id: str, result: WeeklySummaryResponse) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _weekly_summary_cache_path(market_id).write_text(
            json.dumps(result.model_dump(), ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def _apply_portfolio_holding_flags(
    result: WeeklySummaryResponse, portfolio_tickers: list[str]
) -> WeeklySummaryResponse:
    """Re-derive is_portfolio_holding on key_earnings_ahead against the
    CURRENT portfolio_tickers, independent of whatever the model itself
    set (or whatever was cached). This lets the flag stay accurate as the
    user's portfolio changes without needing to re-run the (expensive,
    web-search-backed) analysis just because a holding was added/removed —
    the cache still serves the underlying weekly analysis, only this
    cheap, deterministic flag is recomputed on every request.

    Always recomputes, even when `portfolio_tickers` is empty: an
    earlier request (with a non-empty portfolio) may have cached a
    result whose earnings items still carry `is_portfolio_holding:
    true` from that prior flagging pass, and if the user's portfolio
    later becomes empty, that stale `true` must be cleared back to
    `false` rather than left as-is."""
    held = {t.strip().upper() for t in portfolio_tickers if t.strip()}
    updated_earnings = [
        item.model_copy(
            update={
                "is_portfolio_holding": bool(item.ticker) and item.ticker.strip().upper() in held
            }
        )
        for item in result.key_earnings_ahead
    ]
    return result.model_copy(update={"key_earnings_ahead": updated_earnings})


def get_weekly_summary(
    market_id: str,
    force_refresh: bool = False,
    portfolio_tickers: list[str] | None = None,
) -> WeeklySummaryResponse:
    """Public entry point for "סיכום שבועי": serves the cached result for
    this market when it's less than a day old, otherwise (or when
    `force_refresh` is set, e.g. a "רענן עכשיו" click) runs a fresh
    web-search-backed analyze_weekly_summary() call and refreshes the
    cache. `portfolio_tickers`, when given, is both passed into a fresh
    analysis run (so the model can name/flag matching earnings reports)
    AND re-applied on top of a cached result (see
    _apply_portfolio_holding_flags) so the flag never goes stale between
    analysis refreshes just because the user's holdings changed.
    """
    market_id = market_id.strip().lower()
    portfolio_tickers = portfolio_tickers or []
    if not force_refresh:
        cached = _read_weekly_summary_cache(market_id)
        if cached is not None:
            return _apply_portfolio_holding_flags(cached, portfolio_tickers)

    result = analyze_weekly_summary(market_id, portfolio_tickers=portfolio_tickers)
    cached_at_iso = datetime.now(timezone.utc).isoformat()
    result = result.model_copy(update={"cached_at_iso": cached_at_iso})
    _write_weekly_summary_cache(market_id, result)
    return result


# --- "סיכום שבועי — התיק שלי" — per-holding weekly portfolio recap --------
# See the PortfolioWeeklySummaryResponse docstring in schemas.py. Unlike
# the four generic market summaries above, this one is genuinely about
# THIS user's own current holdings (tickers + weights, sent by the
# frontend — the backend never persists a portfolio), so the cache key is
# a hash of the holdings set rather than a fixed market id: a materially
# different portfolio gets its own cache entry instead of serving a stale
# recap built for different holdings.
PORTFOLIO_WEEKLY_SUMMARY_CACHE_TTL = timedelta(days=1)

PORTFOLIO_WEEKLY_SUMMARY_WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 15,
}

PORTFOLIO_WEEKLY_SUMMARY_SYSTEM_PROMPT = """אתה מנהל תיקים בכיר בקרן גידור, שמכין סיכום שבועי אישי על תיק ההשקעות הספציפי של לקוח - לא סיכום שוק כללי, אלא ניתוח ממוקד בדיוק בניירות שהלקוח מחזיק בפועל. יש לך גישה לכלי חיפוש אינטרנט (web_search) - השתמשו בו בפועל כדי לבדוק מה קרה השבוע לכל אחד מהניירות ברשימה שסופקה לכם (תנועת מחיר, חדשות, קטליזטורים, דוחות), ולא להסתפק בידע כללי/ישן.

**המשימה שלכם:**
1. עבור כל נייר ברשימת ההחזקות שסופקה, מצאו את התשואה השבועית שלו (בפועל, מהחיפוש) ואת הסיבה האמיתית לתנועה - קטליזטור ספציפי (דוח, חדשות, שדרוג/הורדת דירוג, מגמה סקטוריאלית), לא ניחוש כללי.
2. חשבו תשואה משוקללת כוללת לתיק (לפי המשקל היחסי של כל נייר שסופק, אם משקלים סופקו - אחרת התייחסו לכולם באופן שווה) והשוו אותה מול מדד רלוונטי (בדרך כלל S&P 500) - האם התיק הכה את המדד או פיגר אחריו השבוע ולמה.
3. זהו דפוסי קורלציה מעניינים בין ניירות ספציפיים בתיק - למשל שתי מניות שנעות יחד באופן חריג מול נכס/מדד מסוים (ריבית, נפט, דולר, מדד טכנולוגיה וכו'), או ניירות שהתנתקו ממגמה שהיו קשורים אליה בעבר. אם לא נמצא דפוס משמעותי, אמרו זאת בכנות במקום להמציא קורלציה.
4. הסיקו מסקנות ברמת התיק כולו - לא חזרה על מה שכבר נאמר על כל נייר בנפרד, אלא מה השבוע מלמד על אופי התיק (למשל ריכוזיות סקטוריאלית, רגישות יתר לגורם מסוים, איזון טוב/גרוע).
5. ציינו דברים שכדאי לשים לב אליהם בהמשך (watch_items_he) - סיכונים מתקרבים, תלות בנייר בודד, וכו'.
6. אם רלוונטי, הציעו הצעת איזון תיק זהירה (rebalancing_suggestion_he) - למשל צמצום חשיפה לסקטור מרוכז מדי, או תוספת גיוון - אך היו זהירים וברורים שזו מחשבה לשיקול דעת המשתמש, לא ייעוץ השקעות מחייב. אם אין הצעה משמעותית, השאירו null במקום להמציא המלצה גנרית.
7. בדקו אילו סקטורים מקבלים כרגע תשומת לב יתרה בשוק הרחב (טרנדים/באז/ביצועים בולטים), והתייחסו איך זה קשור לתמהיל הסקטורים של התיק הזה עצמו - האם התיק חשוף לסקטורים החמים, חסר בהם, או מרוכז מדי בסקטור שמתקרר.

**דיוק על פני שלמות מדומה:** אם לא נמצא הסבר אמין לתנועה של נייר מסוים, אמרו זאת בפירוש בפסקת ה-reason_he שלו במקום להמציא סיבה. אם לא נמצא דפוס קורלציה משמעותי, החזירו רשימה ריקה ב-correlation_insights במקום להמציא אחד.

החזירו את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "week_range_he": "טווח התאריכים של השבוע שמסוכם",
  "generated_at_he": "לדוגמה: ספטמבר 2026",
  "overall_return_pct": 1.8,
  "overall_return_he": "+1.8%",
  "benchmark_comparison_he": "פסקה קצרה שמשווה מול S&P 500 או מדד רלוונטי אחר",
  "summary_he": "פסקת פתיחה שמתמצתת את השבוע של התיק כולו",
  "holdings": [{"ticker": "NVDA", "company_name_he": "אנבידיה", "weekly_return_pct": 3.2, "weekly_return_he": "+3.2%", "reason_he": "פסקה של 2-4 משפטים שמסבירה למה הנייר הזה עלה/ירד השבוע - קטליזטור אמיתי", "sentiment": "positive | negative | neutral"}],
  "conclusions_he": "פסקת מסקנות ברמת התיק כולו",
  "correlation_insights": [{"title_he": "כותרת קצרה לדפוס שנמצא", "description_he": "פסקה שמסבירה את הקורלציה שנמצאה", "tickers_involved": ["NVDA", "AMD"]}],
  "watch_items_he": ["דבר ראשון לשים לב אליו", "דבר שני"],
  "rebalancing_suggestion_he": "הצעת איזון זהירה, או null אם אין הצעה משמעותית",
  "trending_sectors_he": "פסקה על אילו סקטורים מקבלים תשומת לב בשוק כרגע ואיך זה קשור לתמהיל הסקטורים של התיק הזה",
  "sources": [{"title": "כותרת המקור", "url": "https://..."}]
}

אל תחזירו שום דבר מחוץ לאובייקט ה-JSON."""


def _portfolio_cache_key(holdings: list[dict]) -> str:
    """A stable hash of the tickers (sorted, case-insensitive) so the same
    holdings set — regardless of quantity/weight rounding noise or list
    order — reuses the same cache entry, while an actually different
    portfolio gets its own."""
    tickers = sorted({str(h.get("ticker", "")).strip().upper() for h in holdings if h.get("ticker")})
    digest = hashlib.sha256(",".join(tickers).encode("utf-8")).hexdigest()[:16]
    return digest


def _portfolio_weekly_summary_cache_path(cache_key: str) -> Path:
    return CACHE_DIR / f"weekly_summary_portfolio_cache_{cache_key}.json"


def build_portfolio_weekly_summary(holdings: list[dict]) -> PortfolioWeeklySummaryResponse:
    """Search the live web and produce a per-holding weekly recap for the
    user's OWN current portfolio (tickers + weights supplied by the
    frontend). Real, web-search-backed Claude call — not mock data, same
    declared exception as the rest of the bot.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "סיכום שבועי לתיק אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )
    if not holdings:
        raise ValueError("לא סופק תיק להשוואה — יש להעביר לפחות נייר ערך אחד")

    def _weight_pct_desc(h: dict) -> str:
        # holdings is a loose list[dict] (see PortfolioWeeklySummaryRequest),
        # so weight_pct isn't guaranteed to be numeric — fall back to
        # omitting it rather than letting a malformed value (e.g. a string)
        # crash the whole request with an unhandled formatting error.
        raw = h.get("weight_pct")
        if raw is None:
            return ""
        try:
            return f", משקל בתיק: כ-{float(raw):.1f}%"
        except (TypeError, ValueError):
            return ""

    client = Anthropic(api_key=settings.anthropic_api_key)
    holdings_desc = "\n".join(
        f"- {h.get('ticker', '?')}"
        + (f" ({h.get('company_name_he')})" if h.get("company_name_he") else "")
        + _weight_pct_desc(h)
        + (f", סקטור: {h.get('sector_he')}" if h.get("sector_he") else "")
        for h in holdings
    )

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=12000,
            system=PORTFOLIO_WEEKLY_SUMMARY_SYSTEM_PROMPT,
            tools=[PORTFOLIO_WEEKLY_SUMMARY_WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "הכינו סיכום שבועי אישי לתיק ההשקעות הבא:\n"
                        f"{holdings_desc}\n\n"
                        "חפשו באינטרנט את התשואה השבועית והסיבה האמיתית לתנועה עבור "
                        "כל אחד מהניירות לעיל, ולאחר מכן החזירו אך ורק אובייקט JSON "
                        "תקין לפי ההנחיות במערכת, הכולל שורה בהחזקות (holdings) לכל "
                        "נייר שסופק לעיל - לא פחות."
                    ),
                }
            ],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)
    try:
        return PortfolioWeeklySummaryResponse.model_validate(data)
    except Exception as exc:
        raise ValueError("הסיכום שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc


def _read_portfolio_weekly_summary_cache(cache_key: str) -> PortfolioWeeklySummaryResponse | None:
    path = _portfolio_weekly_summary_cache_path(cache_key)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(raw["cached_at_iso"])
        if datetime.now(timezone.utc) - cached_at > PORTFOLIO_WEEKLY_SUMMARY_CACHE_TTL:
            return None
        return PortfolioWeeklySummaryResponse.model_validate(raw)
    except Exception:
        return None


def _write_portfolio_weekly_summary_cache(
    cache_key: str, result: PortfolioWeeklySummaryResponse
) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _portfolio_weekly_summary_cache_path(cache_key).write_text(
            json.dumps(result.model_dump(), ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def get_portfolio_weekly_summary(
    holdings: list[dict], force_refresh: bool = False
) -> PortfolioWeeklySummaryResponse:
    """Public entry point for "סיכום שבועי — התיק שלי": serves a cached
    result for this exact holdings set (see _portfolio_cache_key) when
    it's less than a day old, otherwise (or when `force_refresh` is set)
    runs a fresh web-search-backed build_portfolio_weekly_summary() call
    and refreshes the cache.
    """
    cache_key = _portfolio_cache_key(holdings)
    if not force_refresh:
        cached = _read_portfolio_weekly_summary_cache(cache_key)
        if cached is not None:
            return cached

    result = build_portfolio_weekly_summary(holdings)
    cached_at_iso = datetime.now(timezone.utc).isoformat()
    result = result.model_copy(update={"cached_at_iso": cached_at_iso})
    _write_portfolio_weekly_summary_cache(cache_key, result)
    return result


CORRELATION_SYSTEM_PROMPT = """אתה Head of Portfolio Risk בקרן גידור מולטי-אסט, כותב הערת מחקר פנימית קצרה (risk research note) על מקדם קורלציה בין שני נכסים (מניה/מדד/סקטור/אג"ח/סחורה) שהפלטפורמה כבר חישבה והציגה. אתה מקבל את המקדם המדויק כפי שהוא — אינך מחפש נתון אחר, ואינך סותר אותו: תפקידך לפרש אותו ברמה מקצועית, לא לאמת אותו מחדש.

הכתיבה חייבת להישמע כמו הערת מחקר פנימית אמיתית של דסק סיכונים בקרן גידור מתוחכמת, לא כהסבר פופולרי:
- טון אנליטי, ממוקד, נטול פטפוט או ריכוך יתר - משפטים קצרים, כל משפט נושא מידע חדש.
- שימוש טבעי (לא מאולץ, לא כרשימת באזז-וורדס) במושגים מקצועיים כשרלוונטי: משטר קורלציה (correlation regime) ויציבותו, התכנסות קורלציות בתרחישי דחק/risk-off (הרבה נכסים "לא-מתואמים" בזמן שקט מתכנסים לקורלציה גבוהה כשהכי לא רוצים את זה), יחס/תועלת גיוון (diversification benefit), בטא וחשיפה לגורם משותף (factor exposure), ריכוזיות סיכון (risk concentration), גידור טבעי מול גידור מלאכותי, והשפעה על position sizing.
- להתייחס במפורש ליציבות/שבריריות של הקורלציה עצמה כשרלוונטי, לא רק לערכה הנוכחי - קורלציות אינן קבועות בזמן.
- להתבסס על ידע כללי ומבוסס על מנגנוני שוק, סקטורים וסוגי נכסים - לא להמציא אירועים/נתונים ספציפיים שלא נמסרו לך.
- אם מדובר בקורלציה נמוכה/קרובה לאפס: לקבוע זאת בביטחון מקצועי ("אין קשר מבני מובהק בין הגורמים המניעים את שני הנכסים בטווח הנוכחי") ולא להמציא קשר שאינו קיים.
- להישאר קריא למשקיע מתוחכם: כל מונח מקצועי מובן מההקשר המיידי שלו, בלי להפוך לז'רגון חסר פשר.

החזר אך ורק אובייקט JSON תקין (ללא markdown, ללא טקסט נוסף) במבנה המדויק הבא:
{
  "summary_he": "1-2 משפטים ברמת הערת מחקר - עוצמת/כיוון הקורלציה והמשמעות המיידית שלה למבנה התיק",
  "reason_he": "2-4 משפטים על המנגנון הכלכלי/סקטוריאלי/מבני שמניע את הקשר (או העדרו), כולל התייחסות ליציבות המשטר הקורלטיבי הזה לאורך זמן/בתרחישי דחק כשרלוונטי",
  "impact_he": "2-3 משפטים ברמת ניהול סיכונים בפועל - ריכוזיות סיכון, תועלת גיוון, גידור טבעי/מלאכותי, והשפעה על position sizing בתיק שמחזיק בשני הנכסים",
  "conclusion_he": "1-2 משפטים - מסקנה תפעולית לבניית/ניהול תיק, בסגנון קריאה-לפעולה אנליטית (להגביל חשיפה משולבת, לנצל כגידור, לעקוב אחרי יציבות הקשר)"
}"""


def explain_correlation(request: CorrelationExplanationRequest) -> CorrelationExplanationResponse:
    """"בדיקת קורלציה": explain a correlation coefficient the frontend
    already computed (lib/mock-data/correlation.ts — deterministic mock,
    not live return history) between any two entities (stock/index/
    sector/bond/commodity).

    Deliberately does NOT use web_search (unlike most of the bot's other
    features): the goal is to interpret the number already shown to the
    user, not to fetch a possibly different one live and contradict the
    UI. Still a real Claude call, not mock data - same declared exception
    as the rest of the bot (requires ANTHROPIC_API_KEY, no silent
    fallback).
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "הסבר הקורלציה אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    client = Anthropic(api_key=settings.anthropic_api_key)
    user_message = (
        f'הקורלציה שחושבה בין "{request.entity_a_label}" ({request.entity_a_type_he}) '
        f'לבין "{request.entity_b_label}" ({request.entity_b_type_he}), '
        f"לאורך תקופה של {request.period_label_he}, היא {request.correlation_value:.2f} "
        "(בסולם -1 עד 1). הסבירו אותה לפי ההנחיות במערכת, והחזירו אך ורק אובייקט JSON תקין."
    )

    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=1200,
            system=CORRELATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception as exc:  # network/auth/rate-limit errors from the SDK
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)
    try:
        return CorrelationExplanationResponse.model_validate(data)
    except Exception as exc:  # pydantic ValidationError
        raise ValueError("ההסבר שהתקבל אינו תואם למבנה הצפוי — נסו שוב") from exc
