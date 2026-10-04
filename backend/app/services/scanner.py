"""Bot feature "סורק מניות" (stock scanner): four watchlists in one
scan — trending stocks, momentum breakouts with real social-media buzz,
stocks showing signs of institutional/insider ("smart money")
accumulation, and stocks with unusual PUT/CALL options flow.

Real, web-search-backed Claude call — same declared "real AI, not mock"
exception as the rest of research.py — kept in its own module (and its
own router) since it's a conceptually separate bot capability, not
another "research a specific ticker/report" endpoint.

Important honesty note baked into the system prompt: there is no way to
see a hedge fund's live book. What the model can actually surface for
"smart money" is public-but-imperfect signal — 13F filings (quarterly,
disclosed with a ~45-day lag), Form 4 insider-buying filings (disclosed
within ~2 business days, genuinely early), unusual options activity and
analyst/institutional-flow commentary. The prompt requires the model to
say which of these it's actually using per pick, and the response always
carries a `smart_money_methodology_he` explanation — never a claim of
real-time insight into anyone's actual current position.
"""

from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from anthropic import Anthropic

from app.core.config import settings
from app.models.schemas import (
    OptionsFlowIdea,
    ScannerStockIdea,
    StockScannerJobResponse,
    StockScannerResponse,
    TrendSource,
)
from app.services.research import (  # shared Claude call + response-parsing helpers
    _create_message,
    _extract_json_text,
    _validate_ai,
)

CACHE_DIR = Path(__file__).resolve().parent.parent / "data"
SCANNER_CACHE_PATH = CACHE_DIR / "stock_scanner_cache.json"
# "Trending now" data goes stale fast, but a full scan is an expensive,
# multi-search Claude call — a few hours strikes a reasonable balance
# between freshness and not re-running it on every single panel open.
SCANNER_CACHE_TTL = timedelta(hours=6)

SCANNER_WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 12,
}

SCANNER_SYSTEM_PROMPT = """אתם צוות מסחר/מחקר בקרן גידור שמריץ כל בוקר "סריקת שוק" (market scan) לפני פתיחת המסחר, ומחפש הזדמנויות במניות ציבוריות. יש לכם גישה לכלי חיפוש אינטרנט (web_search) - השתמשו בו בפועל כדי לאתר מידע עדכני ואמיתי, לא להמציא טיקרים או נתונים.

בנו ארבע רשימות נפרדות. **חשוב: כל רשימה צריכה להיות עשירה ומפורטת - 5-6 מניות שונות לכל רשימה, וכל שדה טקסט חופשי (reason_he, signal_he, sentiment_he) צריך להיות פסקה של 2-3 משפטים עם הקשר אמיתי (מספרים, תאריכים, שמות אירועים/קטליזטורים קונקרטיים) - לא משפט אחד קצר וסתמי. זה כלי שאמור לתת תמונת מצב עשירה, לא רשימת טיקרים חפוזה.**

1. **trending (מניות טרנדיות):** 5-6 מניות שהכי מדוברות/פעילות כרגע בשוק - נפח מסחר חריג, כותרות חדשות מרובות, המניות ה"חמות" שכולם מדברים עליהן היום, פרוסות על פני כמה סקטורים שונים (טכנולוגיה, פיננסים, בריאות, אנרגיה, צריכה וכו') ולא רק "מניות AI" חוזרות. לכל מניה כתבו ב-reason_he פסקה מלאה שמסבירה בדיוק למה היא טרנדית עכשיו - איזה אירוע/ידיעה/קטליזטור ספציפי הניע את זה, מתי זה קרה, ומה ההקשר הרחב יותר (למשל דוח רבעוני, שדרוג/הורדת דירוג אנליסט, עסקה, רגולציה, אירוע מאקרו רלוונטי לסקטור) - ואת תנועת המחיר האחרונה אם ידועה (price_action_he).

2. **momentum_breakouts (פריצות מומנטום + באז ברשת):** 5-6 מניות שנראה שרק מתחילות מהלך עולה טכני (למשל פריצת התנגדות, נפח קונים גובר, מומנטום חיובי) ושבמקביל יש עליהן התעניינות/באז אמיתי ברשתות החברתיות (Reddit, X/טוויטר, StockTwits וכו') - לא רק תנועת מחיר בלי הקשר. ב-signal_he כתבו פסקה מלאה שמתארת את אות הבאז/המומנטום הספציפי שמצאתם בפירוט - איזה קהילה/פלטפורמה, איזה סוג שיחה (ספקולציה על short squeeze, התלהבות ממוצר חדש, וכו'), והיקף התופעה (למשל "עלייה חדה במספר האזכורים ב-Reddit/r/wallstreetbets לאורך 3 הימים האחרונים" או "נפח מסחר פי 3 מהממוצע היומי בשני הימים האחרונים, יחד עם עלייה חדה בריבית הפתוחה באופציות").

3. **smart_money (כסף חכם - קרנות גידור וגופים מוסדיים):** 5-6 מניות שיש בהן סימנים אמיתיים לצבירה מוסדית/פנימית *לפני* שהציבור הרחב שם לב. **חשוב מאוד - יושרה מקצועית:** אין דרך אמיתית לדעת מה הפוזיציה הנוכחית בפועל של קרן גידור בזמן אמת - כל מה שיש הם אותות ציבוריים לא מושלמים:
   - דיווחי 13F (רבעוניים, מתפרסמים בפיגור של עד 45 יום - אז "חדש" פה אומר "הדיווח האחרון שהתפרסם, גם אם משקף רבעון שחלף")
   - דיווחי Form 4 (רכישות פנים/מנהלים - אלה מתפרסמים תוך יומיים עסקים, ולכן הם באמת "מוקדם" יחסית לציבור הרחב)
   - זרימת הון מוסדית או אזכור אנליסטים/מקורות פיננסיים אמינים לגבי צבירה מוסדית (לא כולל אופציות - זה נמצא ברשימה הנפרדת למטה)
   לכל מניה ב-smart_money כתבו ב-reason_he פסקה מלאה על מי צובר/קונה (איזו קרן/גוף אם ידוע, או "כמה קרנות גדולות" אם לא ידוע שם ספציפי), כמה (היקף כספי/מספר מניות אם ידוע), ולמה זה מעניין (תזה אפשרית מאחורי הצבירה). וב-signal_he ציינו *בדיוק* איזה סוג אות זה היה (13F / Form 4 / אחר) ומתי דווח, כדי שהמשתמש יבין את מגבלת הזמן האמיתית. לעולם אל תרמזו שיש לכם ידע בזמן אמת על פוזיציה של קרן.
   בנוסף, מלאו את smart_money_methodology_he בהסבר כללי (3-4 משפטים) שמסביר לכל המשתמשים את המגבלה הזו - שדיווחי 13F מגיעים בפיגור ושאין דרך לדעת פוזיציה בזמן אמת, ושה"אותות" כאן הם ציבוריים ומתפרשים, לא מידע פנימי.

4. **unusual_options (זרימת אופציות חריגה - PUT/CALL):** 5-6 מניות עם נפח/פרמיה חריגים בעסקאות אופציות קול (call) או פוט (put) ביחס לממוצע/לריבית פתוחה (open interest) - כלומר "הימור" חד-צדדי גדול וחריג של סוחר/גוף כלשהו. שאפו לגיוון: גם כמה תזרימי CALL וגם כמה תזרימי PUT, על פני כמה סקטורים שונים. לכל מניה ב-unusual_options כתבו ב-reason_he פסקה מלאה שמתארת את העסקה החריגה בפירוט - היקף הנפח ביחס לממוצע/לריבית הפתוחה, האם זו עסקה בודדת גדולה ("block trade") או צבירה הדרגתית, ובאיזה הקשר (למשל סמוך לדוח רבעוני צפוי, סמוך לאירוע רגולטורי, וכו'). ציינו גם: flow_type ("call" או "put" - הכיוון הדומיננטי), premium_he (היקף הפרמיה בדולרים אם ידוע, למשל "כ-4.2 מיליון דולר בפרמיות קול"), expiration_he (מועד הפקיעה של החוזים אם ידוע, למשל "פקיעה שבועית 26/09" - ככל שהפקיעה קרובה יותר, ההימור אגרסיבי יותר), ו-sentiment_he (פסקה מלאה עם הפרשנות - האם זה נראה שורי או דובי, למה, ומה זה עשוי לרמז על ציפיות השוק לגבי המניה בטווח הקצר). **יושרה מקצועית כאן גם:** ב-risk_note_he ציינו תמיד שזרימת אופציות חריגה יכולה לשקף גם גידור (hedging) או אסטרטגיית ספרד (spread) ולא בהכרח הימור כיווני נטו טהור - זה אות שכדאי לבדוק לעומק, לא ודאות.

לכל מניה בכל הרשימות: ticker אמיתי וקיים, company_name, ו-risk_note_he מפורט (לא רק משפט אחד) עם אזהרת סיכון ספציפית ורלוונטית לאותה מניה/מצב (מניות טרנדיות/מומנטום הן לרוב תנודתיות מאוד - הסבירו למה במקרה הספציפי הזה).

כל קריאה אליכם בונה **רשימה אחת בלבד** מתוך הארבע - הודעת המשתמש תציין איזו, ואת מבנה ה-JSON המדויק שיש להחזיר עבורה. השתמשו בהנחיות למעלה עבור אותה רשימה בלבד.

החזירו *אך ורק* אובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי), במבנה שמופיע בהודעת המשתמש. אל תחזירו שום דבר מחוץ לאובייקט ה-JSON."""


# One Claude call per watchlist, run in parallel. A single call building all
# four lists (5-6 detailed Hebrew picks each, plus web searches and the
# model's own thinking, which counts toward max_tokens) kept hitting the
# max_tokens cap mid-JSON. Per-list calls each get the full budget, and
# running them concurrently also makes a fresh scan faster.
SCANNER_MAX_TOKENS_PER_CALL = 16000
SCANNER_SEARCHES_PER_CALL = 4

_STOCK_IDEA_JSON = (
    '{"ticker": "...", "company_name": "...", "reason_he": "...", '
    '"price_action_he": "... או null", "signal_he": "... או null", "risk_note_he": "..."}'
)
_SOURCES_JSON = '"sources": [{"title": "כותרת המקור", "url": "https://..."}]'

SCANNER_CATEGORIES: dict[str, dict[str, str]] = {
    "trending": {
        "label_he": "1. trending (מניות טרנדיות)",
        "shape": '{"trending": [' + _STOCK_IDEA_JSON + "], " + _SOURCES_JSON + "}",
    },
    "momentum_breakouts": {
        "label_he": "2. momentum_breakouts (פריצות מומנטום + באז ברשת)",
        "shape": '{"momentum_breakouts": [' + _STOCK_IDEA_JSON + "], " + _SOURCES_JSON + "}",
    },
    "smart_money": {
        "label_he": "3. smart_money (כסף חכם) - כולל smart_money_methodology_he",
        "shape": (
            '{"smart_money": [' + _STOCK_IDEA_JSON + "], "
            '"smart_money_methodology_he": "ההסבר הכללי על מגבלות ה-13F/Form 4", '
            + _SOURCES_JSON + "}"
        ),
    },
    "unusual_options": {
        "label_he": "4. unusual_options (זרימת אופציות חריגה - PUT/CALL)",
        "shape": (
            '{"unusual_options": [{"ticker": "...", "company_name": "...", '
            '"flow_type": "call | put", "reason_he": "...", "premium_he": "...", '
            '"expiration_he": "...", "sentiment_he": "...", "risk_note_he": "..."}], '
            + _SOURCES_JSON + "}"
        ),
    },
}

# Shown if the smart-money call fails while the others succeed, so the
# methodology caveat never silently disappears from the panel.
DEFAULT_SMART_MONEY_METHODOLOGY_HE = (
    "אין דרך לראות בזמן אמת מה מחזיקה קרן גידור. האותות כאן ציבוריים ולא מושלמים: "
    "דיווחי 13F מתפרסמים רבעונית בפיגור של עד 45 יום, ודיווחי Form 4 על רכישות "
    "מנהלים מתפרסמים תוך כיומיים עסקים. אלה רמזים לבדיקה נוספת, לא מידע פנימי."
)


def _scan_category(client: Anthropic, key: str) -> dict[str, Any]:
    spec = SCANNER_CATEGORIES[key]
    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=SCANNER_MAX_TOKENS_PER_CALL,
            system=SCANNER_SYSTEM_PROMPT,
            tools=[{**SCANNER_WEB_SEARCH_TOOL, "max_uses": SCANNER_SEARCHES_PER_CALL}],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"הריצו עכשיו את הרשימה הבאה בלבד: {spec['label_he']}. "
                        "חפשו באינטרנט כדי לאתר 5-6 מניות אמיתיות ועדכניות, וכתבו לכל "
                        "שדה טקסט חופשי 2-3 משפטים עם הקשר/מספרים/תאריכים קונקרטיים, "
                        "כמפורט בהנחיות המערכת עבור רשימה זו. "
                        f"החזירו אך ורק אובייקט JSON תקין במבנה הזה: {spec['shape']}"
                    ),
                }
            ],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    return _extract_json_text(message)


def analyze_stock_scanner() -> StockScannerResponse:
    """Search the live web and build the four scanner watchlists — one
    Claude call per list, in parallel, merged into one response.

    Real, web-search-backed Claude calls — not mock data. A list whose
    call fails comes back empty (logged) as long as at least one list
    succeeded; if every call fails, raises ValueError with the first
    error, which surfaces to the user as a scan error.
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "סורק המניות אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    client = Anthropic(api_key=settings.anthropic_api_key)

    results: dict[str, dict[str, Any]] = {}
    errors: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=len(SCANNER_CATEGORIES)) as pool:
        futures = {pool.submit(_scan_category, client, key): key for key in SCANNER_CATEGORIES}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                errors[key] = str(exc)
                print(f"[stock_scanner] {key} failed: {exc!a}", flush=True)

    if not results:
        raise ValueError(next(iter(errors.values())))

    lists: dict[str, list[Any]] = {}
    for key in SCANNER_CATEGORIES:
        item_model = OptionsFlowIdea if key == "unusual_options" else ScannerStockIdea
        raw_items = results.get(key, {}).get(key, [])
        lists[key] = []
        for raw_item in raw_items if isinstance(raw_items, list) else []:
            # One malformed pick is skipped, not the whole list.
            try:
                lists[key].append(_validate_ai(item_model, raw_item))
            except ValueError:
                print(f"[stock_scanner] {key}: skipped an unusable item", flush=True)

    if not any(lists.values()):
        raise ValueError("תוצאות הסריקה שהתקבלו אינן תואמות למבנה הצפוי — נסו שוב")

    sources: list[TrendSource] = []
    seen_urls: set[str] = set()
    for key in SCANNER_CATEGORIES:
        for raw in results.get(key, {}).get("sources", []) or []:
            try:
                source = TrendSource.model_validate(raw)
            except Exception:
                continue
            if source.url and source.url in seen_urls:
                continue
            seen_urls.add(source.url or "")
            sources.append(source)

    methodology = results.get("smart_money", {}).get("smart_money_methodology_he")
    return StockScannerResponse(
        generated_at_he=_now_israel_he(),
        trending=lists["trending"],
        momentum_breakouts=lists["momentum_breakouts"],
        smart_money=lists["smart_money"],
        smart_money_methodology_he=methodology or DEFAULT_SMART_MONEY_METHODOLOGY_HE,
        unusual_options=lists["unusual_options"],
        sources=sources[:15],
    )


def _now_israel_he() -> str:
    try:
        now = datetime.now(ZoneInfo("Asia/Jerusalem"))
    except Exception:  # no tz database on this machine
        now = datetime.now(timezone.utc)
    return now.strftime("%d/%m/%Y, %H:%M")


def _read_scanner_cache() -> StockScannerResponse | None:
    if not SCANNER_CACHE_PATH.exists():
        return None
    try:
        raw = json.loads(SCANNER_CACHE_PATH.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(raw["cached_at_iso"])
        if datetime.now(timezone.utc) - cached_at > SCANNER_CACHE_TTL:
            return None
        return StockScannerResponse.model_validate(raw)
    except Exception:
        return None


def _write_scanner_cache(result: StockScannerResponse) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        SCANNER_CACHE_PATH.write_text(
            json.dumps(result.model_dump(), ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass


def get_stock_scanner(force_refresh: bool = False) -> StockScannerResponse:
    """Public entry point for "סורק מניות": serves the cached scan when
    it's less than SCANNER_CACHE_TTL old, otherwise (or when
    `force_refresh` is set, e.g. a "רענן עכשיו" click) runs a fresh
    web-search-backed analyze_stock_scanner() call and refreshes the
    cache.
    """
    if not force_refresh:
        cached = _read_scanner_cache()
        if cached is not None:
            return cached

    result = analyze_stock_scanner()
    cached_at_iso = datetime.now(timezone.utc).isoformat()
    result = result.model_copy(update={"cached_at_iso": cached_at_iso})
    _write_scanner_cache(result)
    return result


# --- Background job -----------------------------------------------------
# A fresh scan (many web searches + a long Hebrew JSON answer) takes several
# minutes — far longer than a browser request should hang. So a fresh scan
# runs in a background thread and the frontend polls get_scan_status().
# State is per-process memory: if Render restarts the service mid-scan the
# job is simply lost ("idle"), and the user can start it again.

_job_lock = threading.Lock()
_job: dict[str, Any] = {"status": "idle", "error_he": None}


def _run_scan_job() -> None:
    try:
        get_stock_scanner(force_refresh=True)
        outcome: dict[str, Any] = {"status": "done", "error_he": None}
    except ValueError as exc:
        outcome = {"status": "error", "error_he": str(exc)}
    except Exception as exc:  # never leave the job stuck in "running"
        print(f"[stock_scanner] background scan crashed: {exc!a}", flush=True)
        outcome = {"status": "error", "error_he": "סריקת המניות נכשלה — נסו שוב"}
    with _job_lock:
        _job.update(outcome)


def start_scan(force_refresh: bool = False) -> StockScannerJobResponse:
    """Serve a fresh cached scan immediately; otherwise start a background
    scan (unless one is already running) and report "running"."""
    if not force_refresh:
        cached = _read_scanner_cache()
        if cached is not None:
            return StockScannerJobResponse(status="done", result=cached)

    with _job_lock:
        if _job["status"] == "running":
            return StockScannerJobResponse(status="running")
        _job.update(status="running", error_he=None)

    threading.Thread(target=_run_scan_job, daemon=True).start()
    return StockScannerJobResponse(status="running")


def get_scan_status() -> StockScannerJobResponse:
    with _job_lock:
        status, error_he = _job["status"], _job["error_he"]

    if status == "running":
        return StockScannerJobResponse(status="running")
    if status == "error":
        return StockScannerJobResponse(status="error", error_he=error_he)

    cached = _read_scanner_cache()
    if cached is not None:
        return StockScannerJobResponse(status="done", result=cached)
    return StockScannerJobResponse(status="idle")
