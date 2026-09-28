"""Tiny startup migration shim.

This project has no Alembic (see main.py's comment on `create_all`) — for
local dev that's fine, since SQLite only ever needs to create fresh
tables. In production (Postgres, with tables already live from earlier
deploys), `Base.metadata.create_all()` CANNOT add a column to a table
that already exists, or change an existing constraint. Two of this
project's recent features ran straight into that:

- entry 56 added `total_assets_usd_m`/`total_equity_usd_m` to the
  already-live `uploaded_financial_periods` table (for ROE/ROA derived
  from an uploaded report) — `create_all()` alone would silently leave
  those columns missing in production, breaking that feature.
- entry 57 (per-user isolation for uploaded reports) adds
  `uploaded_by_user_id` to `uploaded_guidance_estimates` and widens both
  tables' unique constraints to include it, so two different users
  uploading the same ticker/period don't collide or see each other's
  data — again something `create_all()` cannot do to an existing table.

This module runs a small number of one-off, idempotent `ALTER TABLE`
statements at startup, right after `create_all()`, to patch already-
existing tables forward. Every step checks the live schema first (via
SQLAlchemy's inspector), so it's a no-op on a table that's already up to
date — safe to run on every restart, not just once.

Add a new step here whenever a column is added to, or a constraint is
changed on, a table that may already exist in production. Never assume
`create_all()` will handle it — it only creates tables that don't exist
yet.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _existing_columns(engine: Engine, table_name: str) -> set[str]:
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns(table_name)}


def _existing_unique_constraint_names(engine: Engine, table_name: str) -> set[str]:
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return set()
    return {uc["name"] for uc in inspector.get_unique_constraints(table_name) if uc.get("name")}


def _add_column_if_missing(engine: Engine, table: str, column: str, ddl_type: str) -> None:
    if not inspect(engine).get_table_names() or table not in inspect(engine).get_table_names():
        return  # table doesn't exist yet — create_all() will create it fully, nothing to patch
    if column in _existing_columns(engine, table):
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))


def run_startup_migrations(engine: Engine) -> None:
    """Idempotent, additive-only schema patches for tables that may
    already exist in production. Call this AFTER Base.metadata.create_all()
    so brand-new tables (which already have the final shape, from the
    model definitions) exist before we check what's missing."""
    is_postgres = engine.dialect.name == "postgresql"
    float_type = "DOUBLE PRECISION" if is_postgres else "FLOAT"
    int_type = "INTEGER"

    # entry 56 — ROE/ROA inputs added to an already-live table.
    _add_column_if_missing(engine, "uploaded_financial_periods", "total_assets_usd_m", float_type)
    _add_column_if_missing(engine, "uploaded_financial_periods", "total_equity_usd_m", float_type)

    # entry 57 — per-user isolation. uploaded_financial_periods already had
    # uploaded_by_user_id from the start; uploaded_guidance_estimates didn't.
    _add_column_if_missing(engine, "uploaded_guidance_estimates", "uploaded_by_user_id", int_type)

    if not is_postgres:
        # SQLite (local dev only): altering an existing table's UNIQUE
        # constraint requires rebuilding the whole table, which isn't
        # worth the complexity for a throwaway dev DB. The narrower
        # constraint without uploaded_by_user_id can still reject a
        # legitimate second user's upload of the same ticker/period in
        # local dev — acceptable there, never in production (Postgres).
        return

    with engine.begin() as conn:
        periods_constraints = _existing_unique_constraint_names(engine, "uploaded_financial_periods")
        if "uq_uploaded_financial_period" in periods_constraints:
            conn.execute(
                text(
                    "ALTER TABLE uploaded_financial_periods "
                    "DROP CONSTRAINT uq_uploaded_financial_period"
                )
            )
        if "uq_uploaded_financial_period_user" not in periods_constraints:
            conn.execute(
                text(
                    "ALTER TABLE uploaded_financial_periods "
                    "ADD CONSTRAINT uq_uploaded_financial_period_user "
                    "UNIQUE (ticker, period_label, period_type, uploaded_by_user_id)"
                )
            )

        guidance_constraints = _existing_unique_constraint_names(engine, "uploaded_guidance_estimates")
        if "uq_uploaded_guidance_estimate" in guidance_constraints:
            conn.execute(
                text(
                    "ALTER TABLE uploaded_guidance_estimates "
                    "DROP CONSTRAINT uq_uploaded_guidance_estimate"
                )
            )
        if "uq_uploaded_guidance_estimate_user" not in guidance_constraints:
            conn.execute(
                text(
                    "ALTER TABLE uploaded_guidance_estimates "
                    "ADD CONSTRAINT uq_uploaded_guidance_estimate_user "
                    "UNIQUE (ticker, period_label, uploaded_by_user_id)"
                )
            )
