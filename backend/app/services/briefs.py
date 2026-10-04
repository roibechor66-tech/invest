"""Bot feature "בריפים" (daily / weekly market briefs): a real,
web-search-backed Claude call per brief kind and market, replacing the
fixed mock content the brief screens showed since Phase 1
(frontend lib/mock-data/bot-briefs.ts).

Same declared "real AI, not mock" exception as the rest of the bot, and
the same shared call path (research._create_message / _extract_json_text /
_validate_ai), so briefs get the app-wide effort, token, JSON-repair and
schema-tolerance handling. Results are cached per kind + market (+ the
relevant holdings), shared across users: 3 hours for a daily brief, 12 for
a weekly one, with `force` for an explicit "רענן עכשיו".

The portfolio-vs-S&P 500 comparison is deliberately NOT part of this AI
call — the frontend computes it from real numbers it already has (live
portfolio day change, live SPY quote, the portfolio performance endpoint),
so the AI never gets to guess the user's own returns.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from anthropic import Anthropic

from app.core.config import settings
from app.models.schemas import MarketBriefResponse
from app.services.research import (
    WEB_SEARCH_TOOL,
    _create_message,
    _extract_json_text,
    _validate_ai,
)

CACHE_DIR = Path(__file__).resolve().parent.parent / "data"
BRIEF_CACHE_TTL = {"daily": timedelta(hours=3), "weekly": timedelta(hours=12)}
BRIEF_KINDS = ("daily", "weekly")
BRIEF_MARKETS = ("portfolio", "il", "us", "asia")

MARKET_SCOPE_HE = {
    "portfolio": (
        "תיק ההשקעות של המשתמש. מדדים מרכזיים: S&P 500, Nasdaq 100, ת״א-35, ת״א-125. "
        "התמקדו במה שרלוונטי למניות שבתיק (רשימת הטיקרים מופיעה בהודעת המשתמש) ולשווקים שבהם הן נסחרות."
    ),
    "il": (
        "שוק ההון הישראלי (הבורסה בתל אביב). מדדים מרכזיים: ת״א-35, ת״א-125, ת״א-טכנולוגיה. "
        "כללו גם אירועי מאקרו ישראליים (בנק ישראל, אינפלציה, שקל-דולר) ודוחות של חברות ישראליות."
    ),
    "us": (
        "שוק המניות האמריקאי. מדדים מרכזיים: S&P 500, Nasdaq 100, Dow Jones ו-VIX. "
        "כללו גם אירועי מאקרו (הפדרל ריזרב, נתוני תעסוקה ואינפלציה) ודוחות של חברות גדולות."
    ),
    "asia": (
        "שווקי אסיה. מדדים מרכזיים: Nikkei 225 (יפן), KOSPI (קוריאה), Hang Seng (הונג קונג), "
        "Shanghai Composite (סין), Nifty 50 (הודו), TAIEX (טייוואן)."
    ),
}

BRIEF_SYSTEM_PROMPT = """אתם האנליסט הראשי בדסק מחקר של קרן גידור, שכותב כל יום בריף שוק תמציתי ומדויק בעברית למשקיעים. יש לכם גישה לכלי חיפוש אינטרנט (web_search) - השתמשו בו בפועל כדי לאסוף נתונים וחדשות אמיתיים ועדכניים מהימים האחרונים. אל תמציאו מספרים, תאריכים, אירועים או ציטוטים.

כללי יושרה:
- כל מספר (תשואת מדד, רמת מדד) חייב להגיע ממה שמצאתם בחיפוש. אם לא מצאתם נתון אמין - החזירו null, אל תנחשו.
- ציינו ב-as_of_he במדויק לאיזה יום מסחר / שבוע הנתונים מתייחסים (למשל: "יום המסחר של יום חמישי, 2 באוקטובר 2026").
- העדיפו מקורות פיננסיים מהימנים: רויטרס, בלומברג, וול סטריט ג׳ורנל, CNBC, MarketWatch, כלכליסט, גלובס, TheMarker, ניקיי אסיה.
- לכל ידיעה ציינו את שם המקור ואת כתובת ה-URL שמצאתם בפועל (אם אין URL - null).

החזירו *אך ורק* אובייקט JSON תקין (ללא markdown, ללא טקסט לפני או אחרי) במבנה המדויק שמופיע בהודעת המשתמש."""

_NEWS_ITEM = '{"text_he": "...", "source_name": "רויטרס", "url": "https://...", "ticker": null}'

DAILY_SHAPE = (
    '{"as_of_he": "...", '
    '"summary_a_he": "מה קרה ביום המסחר האחרון: 4-6 משפטים - תנועות המדדים, הגורמים המרכזיים, סקטורים ומניות בולטים", '
    '"summary_b_he": "מה צפוי היום: 3-5 משפטים - אירועים, נתונים ודוחות צפויים ואיך הם עשויים להשפיע", '
    '"top_headline": ' + _NEWS_ITEM + ", "
    '"index_returns": [{"label_he": "S&P 500", "return_pct": 0.42, "level_he": "5,812"}], '
    '"calendar": [{"when_he": "15:30", "label_he": "...", "importance": "high"}], '
    '"deals_and_companies": [' + _NEWS_ITEM + "], "
    '"top_voice_theme_he": null, '
    '"company_news": [{"text_he": "...", "source_name": "...", "url": "...", "ticker": "NVDA"}], '
    '"sources": [{"title": "...", "url": "https://..."}]}'
)

WEEKLY_SHAPE = (
    '{"as_of_he": "...", '
    '"summary_a_he": "מה עומד להיות השבוע: 4-6 משפטים - האירועים, נתוני המאקרו והדוחות המרכזיים של השבוע הקרוב", '
    '"summary_b_he": "על מה כדאי לשים לב: 3-5 משפטים - הסיכונים, ההזדמנויות והתרחישים שכדאי לעקוב אחריהם", '
    '"top_headline": ' + _NEWS_ITEM + ", "
    '"index_returns": [{"label_he": "S&P 500", "return_pct": 1.3, "level_he": "5,812"}], '
    '"calendar": [{"when_he": "יום שלישי 7/10", "label_he": "...", "importance": "high"}], '
    '"top_sectors": [{"label_he": "טכנולוגיה", "return_pct": 2.1}], '
    '"company_news": [{"text_he": "...", "source_name": "...", "url": "...", "ticker": "NVDA"}], '
    '"sources": [{"title": "...", "url": "https://..."}]}'
)


def _now_israel() -> datetime:
    try:
        return datetime.now(ZoneInfo("Asia/Jerusalem"))
    except Exception:  # no tz database on this machine
        return datetime.now(timezone.utc)


def _relevant_tickers(market: str, portfolio_tickers: list[str]) -> list[str]:
    """Holdings whose news belongs in this market's brief: Israeli (.TA)
    holdings under Israel, the rest under the US, all of them under "my
    portfolio". Asia gets every holding and the model keeps only the
    Asia-relevant ones (e.g. TSM), since there's no reliable suffix rule."""
    tickers = sorted({t.strip().upper() for t in portfolio_tickers if t and t.strip()})
    if market == "il":
        return [t for t in tickers if t.endswith(".TA")]
    if market == "us":
        return [t for t in tickers if not t.endswith(".TA")]
    return tickers


def _user_message(kind: str, market: str, tickers: list[str], now: datetime) -> str:
    today = now.strftime("%A %d/%m/%Y, %H:%M")
    if kind == "daily":
        parts = [
            f"התאריך והשעה עכשיו (שעון ישראל): {today}. כתבו בריף יומי עבור: {MARKET_SCOPE_HE[market]}",
            "חפשו באינטרנט את יום המסחר האחרון שהסתיים בשוק הזה ומה צפוי היום.",
            "index_returns: התשואה היומית (באחוזים) של כל מדד מרכזי ביום המסחר האחרון, ורמת הסגירה.",
            "calendar: 3-6 אירועים של היום (נתוני מאקרו, החלטות ריבית, דוחות חברות) עם שעה (שעון ישראל) וחשיבות.",
            "top_headline: הידיעה החשובה ביותר של היום בשוק הזה.",
        ]
        if market == "us":
            parts.append(
                "deals_and_companies: 2-4 עסקאות (מיזוגים, רכישות, הנפקות) או חברות בולטות מהיממה האחרונה. "
                "top_voice_theme_he: חפשו מה כתב לאחרונה האנליסט שיי בולור (Shay Boloor, @StockSavvyShay) "
                "וסכמו ב-2-3 משפטים את הנושא המרכזי שלו. אם לא מצאתם תוכן אמין ועדכני ממנו - null."
            )
        else:
            parts.append("deals_and_companies: [] ו-top_voice_theme_he: null.")
        shape = DAILY_SHAPE
    else:
        parts = [
            f"התאריך והשעה עכשיו (שעון ישראל): {today}. כתבו בריף שבועי עבור: {MARKET_SCOPE_HE[market]}",
            "חפשו באינטרנט מה צפוי בשבוע המסחר הקרוב ומה קרה בשבוע שהסתיים.",
            "index_returns: התשואה השבועית (באחוזים) של כל מדד מרכזי בשבוע המסחר האחרון שהסתיים, ורמת הסגירה.",
            "calendar: 5-8 אירועים מרכזיים של השבוע הקרוב (נתוני מאקרו, החלטות ריבית, דוחות חברות) עם יום ותאריך וחשיבות.",
            "top_headline: הידיעה החשובה ביותר של השבוע בשוק הזה.",
        ]
        if market in ("us", "portfolio"):
            parts.append("top_sectors: 4 הסקטורים בשוק האמריקאי שעלו הכי הרבה בשבוע שהסתיים, עם התשואה השבועית שלהם.")
        else:
            parts.append("top_sectors: [].")
        shape = WEEKLY_SHAPE

    if tickers:
        parts.append(
            "company_news: חדשות או אירועים מהימים האחרונים על מניות מתיק המשתמש שרלוונטיות לשוק הזה: "
            + ", ".join(tickers)
            + ". רק ידיעות אמיתיות שמצאתם, עד ידיעה אחת לכל מניה, עם הטיקר בשדה ticker. מניה בלי חדשות - השמיטו."
        )
    else:
        parts.append("company_news: [] (למשתמש אין מניות רלוונטיות בתיק).")
    parts.append(f"החזירו אך ורק אובייקט JSON תקין במבנה הזה: {shape}")
    return "\n".join(parts)


def generate_brief(kind: str, market: str, portfolio_tickers: list[str]) -> MarketBriefResponse:
    """Run a fresh, web-search-backed Claude brief. Raises ValueError for
    anything that should surface to the user as a 502."""
    if not settings.anthropic_api_key:
        raise ValueError("הבריפים אינם זמינים כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת")

    now = _now_israel()
    tickers = _relevant_tickers(market, portfolio_tickers)
    client = Anthropic(api_key=settings.anthropic_api_key)
    try:
        message = _create_message(
            client,
            model=settings.anthropic_model,
            max_tokens=12000,
            system=BRIEF_SYSTEM_PROMPT,
            tools=[WEB_SEARCH_TOOL],
            messages=[{"role": "user", "content": _user_message(kind, market, tickers, now)}],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)
    data.update(kind=kind, market=market, generated_at_he=now.strftime("%d/%m/%Y, %H:%M"))
    if kind == "daily":
        data.pop("top_sectors", None)
    else:
        data.pop("deals_and_companies", None)
        data.pop("top_voice_theme_he", None)
    return _validate_ai(MarketBriefResponse, data)


def _cache_path(kind: str, market: str, tickers: list[str]) -> Path:
    digest = hashlib.sha256(",".join(tickers).encode("utf-8")).hexdigest()[:12]
    return CACHE_DIR / f"brief_{kind}_{market}_{digest}.json"


def _read_cache(path: Path, kind: str) -> MarketBriefResponse | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        cached_at = datetime.fromisoformat(raw["cached_at_iso"])
        if datetime.now(timezone.utc) - cached_at > BRIEF_CACHE_TTL[kind]:
            return None
        return MarketBriefResponse.model_validate(raw)
    except Exception:
        return None


def _write_cache(path: Path, result: MarketBriefResponse) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result.model_dump(), ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def get_brief(
    kind: str, market: str, portfolio_tickers: list[str] | None = None, force_refresh: bool = False
) -> MarketBriefResponse:
    """Serve the cached brief for this kind/market/holdings if it's fresh;
    otherwise (or with `force_refresh`) generate a new one and cache it."""
    kind, market = kind.strip().lower(), market.strip().lower()
    if kind not in BRIEF_KINDS or market not in BRIEF_MARKETS:
        raise ValueError("סוג בריף או שוק לא מוכרים")

    tickers = _relevant_tickers(market, portfolio_tickers or [])
    path = _cache_path(kind, market, tickers)
    if not force_refresh:
        cached = _read_cache(path, kind)
        if cached is not None:
            return cached

    result = generate_brief(kind, market, tickers)
    result = result.model_copy(update={"cached_at_iso": datetime.now(timezone.utc).isoformat()})
    _write_cache(path, result)
    return result
