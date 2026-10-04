// Decides whether a return the AI wrote as text went up or down, so it can
// be colored green/red. Checking only for a leading "-" misread many real
// declines as gains (shown in green): the model also writes a Unicode minus
// ("−1.2%") or en dash ("–1.2%"), RTL text can carry an invisible direction
// mark before the sign or end up as "1.2%-", and declines are often written
// in words ("ירידה של 1.2%").

export type ReturnDirection = "up" | "down" | "flat" | "unknown";

const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;
const MINUS = "-−–—";
const NUMBER = new RegExp(`([+${MINUS}])?\\s*(\\d+(?:[.,]\\d+)?)\\s*(%)?\\s*([+${MINUS}](?!\\s*\\d))?`, "g");
const DOWN_WORDS = /ירד|ירידה|ירידות|נפל|צנח|צלל|שלילי|הפסד|נחלש|קיטון|התכווצ/;
const UP_WORDS = /עלה|עלייה|עליה|עליות|זינק|טיפס|חיובי|התחזק|קפץ/;

export function returnDirection(text: string | null | undefined): ReturnDirection {
  if (!text) return "unknown";
  const clean = text.replace(BIDI_MARKS, "").trim();
  // The return is the number with a "%" — not e.g. the "500" in "S&P 500".
  const matches = Array.from(clean.matchAll(NUMBER));
  const match = matches.find((m) => m[3]) ?? matches[0];
  if (match) {
    const value = parseFloat(match[2].replace(",", "."));
    const sign = match[1] ?? match[4];
    if (value === 0) return "flat";
    if (sign && MINUS.includes(sign)) return "down";
    if (sign === "+") return "up";
  }
  if (DOWN_WORDS.test(clean)) return "down";
  if (UP_WORDS.test(clean)) return "up";
  if (match) return "up"; // a bare number with no sign or wording is a gain
  return "unknown";
}

export function directionColor(direction: ReturnDirection): string {
  if (direction === "up") return "text-positive";
  if (direction === "down") return "text-negative";
  return "text-slate-500";
}

// Prefer a real number when there is one; fall back to reading the text.
export function returnColorFor(text: string | null | undefined, pct?: number | null): string {
  if (typeof pct === "number" && Number.isFinite(pct)) {
    return directionColor(pct > 0 ? "up" : pct < 0 ? "down" : "flat");
  }
  return directionColor(returnDirection(text));
}
