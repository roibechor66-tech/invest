"""The Automated Analyst Bot: clickable AI-generated market briefs.

Phase 1: stub endpoints only, one per brief button on the dashboard.
Phase 3 will connect these to real market-data/news APIs and an LLM
prompt pipeline for summarization.
"""

from fastapi import APIRouter

router = APIRouter()

BRIEF_TYPES = [
    "global-news",
    "global-markets",
    "israeli-market",
    "us-market",
    "tech-growth",
    "portfolio",
]


@router.post("/{brief_type}")
def generate_brief(brief_type: str) -> dict:
    """Placeholder brief generator (Phase 3 wires up real data + AI)."""
    if brief_type not in BRIEF_TYPES:
        return {"status": "unknown_brief_type", "brief_type": brief_type}
    return {"status": "not_implemented", "phase": 3, "brief_type": brief_type}
