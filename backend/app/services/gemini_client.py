"""Thin drop-in replacement for the Anthropic Python SDK's `Anthropic`
client / `client.messages.create(...)` call shape, backed by Google's
**free** Gemini API instead of Claude — added for the user's explicit
request: "אני רוצה להחליף את ה-API של אנתרופיק לבוט שיהיה API חינמי של
ג'ימיני" (replace the bot's Anthropic API with a free Gemini API).

**Why a compatibility shim instead of rewriting every call site:**
app/services/research.py and app/services/scanner.py together have ten
separate real-AI call sites (financial-report analysis, PDF-financials
extraction, automated-filing analysis, trend analysis, economic trends,
two weekly-summary variants, price-move explanation, correlation
explanation, the equity-thesis builder, and the stock scanner), several
using Claude's native PDF document support and/or its `web_search` tool.
Rather than hand-port each call's request/response shape to Gemini's very
different `google-genai` SDK, this module exposes a `GeminiClient` whose
`.messages.create(model=, max_tokens=, system=, messages=, tools=)`
mirrors the Anthropic SDK's signature closely enough that every call site
only needed a handful of mechanical substitutions (see CLAUDE.md's entry
on this migration) — no change to any call site's actual request-building
or response-parsing logic. The response object this returns has the same
`.content` shape the rest of the codebase already reads
(`_extract_json_text` in research.py: a list of objects with
`.type == "text"` and `.text`), so that helper needed ZERO changes.

**Free tier / setup:** unlike Anthropic's console (which required a $5
minimum prepaid credit purchase before any call would work — see
CLAUDE.md's note on the user skipping ANTHROPIC_API_KEY for that reason),
Google AI Studio issues a genuinely free API key with no payment method
required, just a per-minute/per-day request-count cap on the free tier:
https://aistudio.google.com/apikey . Set `GEMINI_API_KEY` in backend/.env
to enable every AI-backed bot feature in this app.

**NOT verified against a live call** (no outbound network to
generativelanguage.googleapis.com from this sandbox — same recurring
"no network access" constraint documented throughout this project, e.g.
yfinance's/FMP's unverified field names). The `google-genai` package name,
`genai.Client`, `types.Part.from_text`/`.from_bytes`, `types.Content`,
`types.GenerateContentConfig`, and `types.Tool(google_search=...)` below
match Google's documented public SDK surface as of this project's
knowledge, but **the first time this runs for real, watch the backend
terminal on the very first AI-bot click (e.g. "ניתוח מגמות") and confirm
the call actually succeeds** — same verification step every other
unverified integration in this codebase calls for. If the SDK has renamed
something since, the error will surface as a clear "קריאה ל-Gemini API
נכשלה" ValueError (not a silent failure) with the underlying exception
text, which will show what changed.

**Real behavioral differences from Claude worth knowing:**
1. **Web search:** Claude's `web_search` tool (used by trend analysis,
   economic trends, both weekly-summary variants, price-move explanation,
   the equity thesis builder, and the stock scanner) maps to Gemini's
   built-in "Google Search grounding" tool (`types.Tool(google_search=
   types.GoogleSearch())`). The model decides on its own whether/how much
   to search per request, same as Claude's — but Gemini's grounding tool
   has no equivalent to Claude's `max_uses` cap, so the `max_uses` field on
   every `*_WEB_SEARCH_TOOL` dict in research.py/scanner.py is now inert
   (kept only as documentation of the original Claude-era search budget
   per feature; harmless, just unused by this shim).
2. **PDF documents:** Claude's native inline-base64 PDF support is
   replaced with Gemini's inline-bytes `Part.from_bytes(mime_type=
   "application/pdf")`, which Google documents as supported up to roughly
   20MB per request (larger PDFs need Gemini's separate File-upload API,
   not implemented here) — MAX_PDF_BYTES in research.py was lowered from
   Claude's 32MB limit to reflect this; see that constant's comment.
3. **Output length:** `max_tokens` here maps to Gemini's
   `max_output_tokens`. Free-tier Gemini Flash models have historically
   capped generation shorter than Claude's largest budgets (the equity-
   thesis builder alone requests 16000) — if a bot feature starts
   returning truncated/invalid JSON specifically on its longest-output
   calls, that's the likely cause; either shorten the requested max_tokens
   in research.py or switch GEMINI_MODEL to a higher-output-limit model.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

from google import genai
from google.genai import types

# Sentinel "tool" markers research.py/scanner.py pass in `tools=[...]`
# (each shaped like Claude's `{"type": "web_search_20250305", "name":
# "web_search", "max_uses": N}`) — recognized here by `name` and
# translated to Gemini's Google Search grounding tool. Any other tool
# name would need its own translation, but web_search is the only one
# this codebase ever uses.
_WEB_SEARCH_TOOL_NAMES = {"web_search"}


@dataclass
class _TextBlock:
    """Mirrors the one attribute shape `_extract_json_text()` in
    research.py actually reads off an Anthropic TextBlock."""

    type: str
    text: str


@dataclass
class _GeminiResponse:
    content: list[_TextBlock] = field(default_factory=list)


class _Messages:
    def __init__(self, gemini_client: "GeminiClient") -> None:
        self._gemini_client = gemini_client

    def create(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str | None = None,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> _GeminiResponse:
        contents: list[types.Content] = []
        for msg in messages:
            role = "user" if msg.get("role", "user") == "user" else "model"
            raw_content = msg["content"]
            parts: list[types.Part] = []
            if isinstance(raw_content, str):
                parts.append(types.Part.from_text(text=raw_content))
            else:
                for block in raw_content:
                    block_type = block.get("type")
                    if block_type == "text":
                        parts.append(types.Part.from_text(text=block["text"]))
                    elif block_type == "document":
                        # Anthropic's native-PDF content block shape:
                        # {"type": "document", "source": {"type": "base64",
                        # "media_type": "application/pdf", "data": <b64>}}
                        source = block.get("source", {})
                        pdf_b64 = source.get("data")
                        if pdf_b64 is None:
                            raise ValueError("gemini_client: 'document' block missing base64 data")
                        pdf_bytes = base64.standard_b64decode(pdf_b64)
                        parts.append(types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"))
                    else:
                        raise ValueError(f"gemini_client: unsupported content block type {block_type!r}")
            contents.append(types.Content(role=role, parts=parts))

        gemini_tools: list[types.Tool] = []
        for tool in tools or []:
            if tool.get("name") in _WEB_SEARCH_TOOL_NAMES:
                gemini_tools.append(types.Tool(google_search=types.GoogleSearch()))

        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            tools=gemini_tools or None,
        )

        response = self._gemini_client._client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

        text = getattr(response, "text", None)
        if not text:
            # Fall back to concatenating text parts from the first
            # candidate, in case a future SDK version's `.text`
            # convenience property comes back empty/None for some
            # response shapes (e.g. a response that only carries
            # grounding/tool-call parts).
            text = ""
            for candidate in getattr(response, "candidates", None) or []:
                content = getattr(candidate, "content", None)
                for part in getattr(content, "parts", None) or []:
                    part_text = getattr(part, "text", None)
                    if part_text:
                        text += part_text

        return _GeminiResponse(content=[_TextBlock(type="text", text=text or "")])


class GeminiClient:
    """Drop-in replacement for `anthropic.Anthropic(api_key=...)` — see
    module docstring for the full rationale. Every call site in
    research.py/scanner.py uses only `GeminiClient(api_key=...)` and
    `.messages.create(model=, max_tokens=, system=, messages=, tools=)`,
    exactly like the Anthropic SDK usage it replaces.
    """

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)
        self.messages = _Messages(self)
