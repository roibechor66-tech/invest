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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from anthropic import Anthropic

from app.core.config import settings
from app.models.schemas import StockScannerResponse
from app.services.research import _extract_json_text  # shared response-parsing helper

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

בנו ארבע רשימות נפרדות. **חשוב: כל רשימה צריכה להיות עשירה ומפורטת - 7-10 מניות שונות לכל רשימה (לא פחות מ-7), וכל שדה טקסט חופשי (reason_he, signal_he, sentiment_he) צריך להיות פסקה מלאה של 2-4 משפטים לפחות עם הקשר אמיתי (מספרים, תאריכים, שמות אירועים/קטליזטורים קונקרטיים) - לא משפט אחד קצר וסתמי. זה כלי שאמור לתת תמונת מצב עשירה, לא רשימת טיקרים חפוזה.**

1. **trending (מניות טרנדיות):** 7-10 מניות שהכי מדוברות/פעילות כרגע בשוק - נפח מסחר חריג, כותרות חדשות מרובות, המניות ה"חמות" שכולם מדברים עליהן היום, פרוסות על פני כמה סקטורים שונים (טכנולוגיה, פיננסים, בריאות, אנרגיה, צריכה וכו') ולא רק "מניות AI" חוזרות. לכל מניה כתבו ב-reason_he פסקה מלאה שמסבירה בדיוק למה היא טרנדית עכשיו - איזה אירוע/ידיעה/קטליזטור ספציפי הניע את זה, מתי זה קרה, ומה ההקשר הרחב יותר (למשל דוח רבעוני, שדרוג/הורדת דירוג אנליסט, עסקה, רגולציה, אירוע מאקרו רלוונטי לסקטור) - ואת תנועת המחיר האחרונה אם ידועה (price_action_he).

2. **momentum_breakouts (פריצות מומנטום + באז ברשת):** 7-10 מניות שנראה שרק מתחילות מהלך עולה טכני (למשל פריצת התנגדות, נפח קונים גובר, מומנטום חיובי) ושבמקביל יש עליהן התעניינות/באז אמיתי ברשתות החברתיות (Reddit, X/טוויטר, StockTwits וכו') - לא רק תנועת מחיר בלי הקשר. ב-signal_he כתבו פסקה מלאה שמתארת את אות הבאז/המומנטום הספציפי שמצאתם בפירוט - איזה קהילה/פלטפורמה, איזה סוג שיחה (ספקולציה על short squeeze, התלהבות ממוצר חדש, וכו'), והיקף התופעה (למשל "עלייה חדה במספר האזכורים ב-Reddit/r/wallstreetbets לאורך 3 הימים האחרונים" או "נפח מסחר פי 3 מהממוצע היומי בשני הימים האחרונים, יחד עם עלייה חדה בריבית הפתוחה באופציות").

3. **smart_money (כסף חכם - קרנות גידור וגופים מוסדיים):** 7-10 מניות שיש בהן סימנים אמיתיים לצבירה מוסדית/פנימית *לפני* שהציבור הרחב שם לב. **חשוב מאוד - יושרה מקצועית:** אין דרך אמיתית לדעת מה הפוזיציה הנוכחית בפועל של קרן גידור בזמן אמת - כל מה שיש הם אותות ציבוריים לא מושלמים:
   - דיווחי 13F (רבעוניים, מתפרסמים בפיגור של עד 45 יום - אז "חדש" פה אומר "הדיווח האחרון שהתפרסם, גם אם משקף רבעון שחלף")
   - דיווחי Form 4 (רכישות פנים/מנהלים - אלה מתפרסמים תוך יומיים עסקים, ולכן הם באמת "מוקדם" יחסית לציבור הרחב)
   - זרימת הון מוסדית או אזכור אנליסטים/מקורות פיננסיים אמינים לגבי צבירה מוסדית (לא כולל אופציות - זה נמצא ברשימה הנפרדת למטה)
   לכל מניה ב-smart_money כתבו ב-reason_he פסקה מלאה על מי צובר/קונה (איזו קרן/גוף אם ידוע, או "כמה קרנות גדולות" אם לא ידוע שם ספציפי), כמה (היקף כספי/מספר מניות אם ידוע), ולמה זה מעניין (תזה אפשרית מאחורי הצבירה). וב-signal_he ציינו *בדיוק* איזה סוג אות זה היה (13F / Form 4 / אחר) ומתי דווח, כדי שהמשתמש יבין את מגבלת הזמן האמיתית. לעולם אל תרמזו שיש לכם ידע בזמן אמת על פוזיציה של קרן.
   בנוסף, מלאו את smart_money_methodology_he בהסבר כללי (3-4 משפטים) שמסביר לכל המשתמשים את המגבלה הזו - שדיווחי 13F מגיעים בפיגור ושאין דרך לדעת פוזיציה בזמן אמת, ושה"אותות" כאן הם ציבוריים ומתפרשים, לא מידע פנימי.

4. **unusual_options (זרימת אופציות חריגה - PUT/CALL):** 7-10 מניות עם נפח/פרמיה חריגים בעסקאות אופציות קול (call) או פוט (put) ביחס לממוצע/לריבית פתוחה (open interest) - כלומר "הימור" חד-צדדי גדול וחריג של סוחר/גוף כלשהו. שאפו לגיוון: גם כמה תזרימי CALL וגם כמה תזרימי PUT, על פני כמה סקטורים שונים. לכל מניה ב-unusual_options כתבו ב-reason_he פסקה מלאה שמתארת את העסקה החריגה בפירוט - היקף הנפח ביחס לממוצע/לריבית הפתוחה, האם זו עסקה בודדת גדולה ("block trade") או צבירה הדרגתית, ובאיזה הקשר (למשל סמוך לדוח רבעוני צפוי, סמוך לאירוע רגולטורי, וכו'). ציינו גם: flow_type ("call" או "put" - הכיוון הדומיננטי), premium_he (היקף הפרמיה בדולרים אם ידוע, למשל "כ-4.2 מיליון דולר בפרמיות קול"), expiration_he (מועד הפקיעה של החוזים אם ידוע, למשל "פקיעה שבועית 26/09" - ככל שהפקיעה קרובה יותר, ההימור אגרסיבי יותר), ו-sentiment_he (פסקה מלאה עם הפרשנות - האם זה נראה שורי או דובי, למה, ומה זה עשוי לרמז על ציפיות השוק לגבי המניה בטווח הקצר). **יושרה מקצועית כאן גם:** ב-risk_note_he ציינו תמיד שזרימת אופציות חריגה יכולה לשקף גם גידור (hedging) או אסטרטגיית ספרד (spread) ולא בהכרח הימור כיווני נטו טהור - זה אות שכדאי לבדוק לעומק, לא ודאות.

לכל מניה בכל הרשימות: ticker אמיתי וקיים, company_name, ו-risk_note_he מפורט (לא רק משפט אחד) עם אזהרת סיכון ספציפית ורלוונטית לאותה מניה/מצב (מניות טרנדיות/מומנטום הן לרוב תנודתיות מאוד - הסבירו למה במקרה הספציפי הזה).

החזירו את הניתוח *אך ורק* כאובייקט JSON תקין (ללא markdown, ללא בלוק קוד, ללא טקסט לפני או אחרי) במבנה המדויק הבא:
{
  "generated_at_he": "לדוגמה: 22 בספטמבר 2026, 09:00",
  "trending": [{"ticker": "AAPL", "company_name": "Apple Inc.", "reason_he": "פסקה מלאה...", "price_action_he": "...", "signal_he": null, "risk_note_he": "פסקה מלאה..."}],
  "momentum_breakouts": [{"ticker": "...", "company_name": "...", "reason_he": "...", "price_action_he": "...", "signal_he": "פסקה מלאה עם תיאור אות הבאז/המומנטום הספציפי", "risk_note_he": "..."}],
  "smart_money": [{"ticker": "...", "company_name": "...", "reason_he": "פסקה מלאה...", "price_action_he": null, "signal_he": "13F/Form 4 - פירוט מדויק ותאריך", "risk_note_he": "..."}],
  "smart_money_methodology_he": "ההסבר הכללי על מגבלות ה-13F/Form 4 כמתואר למעלה",
  "unusual_options": [{"ticker": "...", "company_name": "...", "flow_type": "call | put", "reason_he": "פסקה מלאה...", "premium_he": "...", "expiration_he": "...", "sentiment_he": "פסקה מלאה...", "risk_note_he": "..."}],
  "sources": [{"title": "כותרת המקור", "url": "https://..."}]
}

7-10 מניות בכל רשימה (לא פחות מ-7), עם פסקאות מלאות ומפורטות בכל שדה טקסט חופשי כמתואר למעלה. וודאו גם רשימת sources עשירה - 8-12 מקורות אמיתיים לפחות מהחיפושים שביצעתם. אל תחזירו שום דבר מחוץ לאובייקט ה-JSON."""


def analyze_stock_scanner() -> StockScannerResponse:
    """Search the live web and build the four scanner watchlists.

    Real, web-search-backed Claude call — not mock data. Raises
    ValueError for anything that should surface to the user as a 502
    (missing API key, a failed API call, malformed model output).
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "סורק המניות אינו זמין כרגע — לא הוגדר מפתח API (ANTHROPIC_API_KEY) בשרת"
        )

    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=12000,
            system=SCANNER_SYSTEM_PROMPT,
            tools=[SCANNER_WEB_SEARCH_TOOL],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "הריצו סריקת שוק עכשיו, בצורה עשירה ומפורטת. חפשו "
                        "באינטרנט כדי לאתר 7-10 מניות טרנדיות אמיתיות "
                        "(פרוסות על פני כמה סקטורים), 7-10 פריצות מומנטום עם "
                        "באז אמיתי ברשתות החברתיות, 7-10 סימנים אמיתיים "
                        "(13F / Form 4) לצבירה מוסדית, ו-7-10 מניות עם זרימת "
                        "אופציות PUT/CALL חריגה. לכל מניה כתבו הסבר מפורט "
                        "(פסקה מלאה, לא משפט אחד) עם הקשר/מספרים/תאריכים "
                        "קונקרטיים, כמפורט בהנחיות המערכת. "
                        "החזירו אך ורק אובייקט JSON תקין לפי ההנחיות במערכת."
                    ),
                }
            ],
        )
    except Exception as exc:
        raise ValueError(f"קריאה ל-Claude API נכשלה: {exc}") from exc

    data = _extract_json_text(message)

    try:
        return StockScannerResponse.model_validate(data)
    except Exception as exc:
        raise ValueError("תוצאות הסריקה שהתקבלו אינן תואמות למבנה הצפוי — נסו שוב") from exc


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
