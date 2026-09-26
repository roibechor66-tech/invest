"use client";

import { useState } from "react";
import clsx from "clsx";
import { IncomeStatementBreakdown, formatUsdM } from "@/lib/mock-data/financial-statements";

interface IncomeStatementFlowProps {
  companyNameHe: string;
  annual: IncomeStatementBreakdown;
  quarterly: IncomeStatementBreakdown;
}

interface FlowNode {
  id: string;
  labelHe: string;
  value: number;
  column: number;
  y: number;
  height: number;
  color: string;
}

interface FlowLink {
  sourceId: string;
  targetId: string;
  value: number;
}

const WIDTH = 1040;
const CHART_HEIGHT = 300;
const PADDING_TOP = 10;
const PADDING_LEFT = 130;
const PADDING_RIGHT = 130;
const NODE_WIDTH = 18;
const COLUMN_COUNT = 6;
const COLUMN_SPACING = (WIDTH - PADDING_LEFT - PADDING_RIGHT) / (COLUMN_COUNT - 1);
const GAP = 10;

// Validated categorical palette (dataviz skill): blue/aqua-green/red clears
// the CVD and contrast gates together (aqua-green vs. red sits in the 6-8
// "legal only with secondary encoding" band — the diagram already carries
// secondary encoding via the direct name+value+% label on every node).
const GREEN = "#199e70";
const RED = "#e66767";
const BLUE = "#3987e5";

// Stacks a list of {id, value} entries vertically starting at y0, each
// height proportional to value*pxPerUnit, separated by `gap` pixels.
function stack(
  entries: { id: string; value: number }[],
  y0: number,
  pxPerUnit: number,
  gap: number
): Record<string, { y: number; height: number }> {
  const positions: Record<string, { y: number; height: number }> = {};
  let cursor = y0;
  for (const entry of entries) {
    const height = Math.max(entry.value * pxPerUnit, 1);
    positions[entry.id] = { y: cursor, height };
    cursor += height + gap;
  }
  return positions;
}

function buildLayout(breakdown: IncomeStatementBreakdown): { nodes: FlowNode[]; links: FlowLink[] } {
  const pxPerUnit = CHART_HEIGHT / breakdown.revenueUsdM;
  const y0 = PADDING_TOP;

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // Column 0: revenue segments -> Column 1: revenue (exact partition)
  const segEntries = breakdown.segments.map((s, i) => ({ id: `seg${i}`, value: s.valueUsdM }));
  const segPositions = stack(segEntries, y0, pxPerUnit, 0);
  breakdown.segments.forEach((s, i) => {
    const pos = segPositions[`seg${i}`];
    nodes.push({ id: `seg${i}`, labelHe: s.nameHe, value: s.valueUsdM, column: 0, y: pos.y, height: pos.height, color: BLUE });
    links.push({ sourceId: `seg${i}`, targetId: "revenue", value: s.valueUsdM });
  });
  const revenuePos = stack([{ id: "revenue", value: breakdown.revenueUsdM }], y0, pxPerUnit, 0).revenue;
  nodes.push({ id: "revenue", labelHe: "הכנסות", value: breakdown.revenueUsdM, column: 1, ...revenuePos, color: BLUE });

  // Column 2: gross profit + COGS (exact partition of revenue)
  const gpCogsPositions = stack(
    [
      { id: "grossProfit", value: breakdown.grossProfitUsdM },
      { id: "cogs", value: breakdown.cogsUsdM },
    ],
    y0,
    pxPerUnit,
    0
  );
  nodes.push({ id: "grossProfit", labelHe: "רווח גולמי", value: breakdown.grossProfitUsdM, column: 2, ...gpCogsPositions.grossProfit, color: GREEN });
  nodes.push({ id: "cogs", labelHe: "עלות המכר (COGS)", value: breakdown.cogsUsdM, column: 2, ...gpCogsPositions.cogs, color: RED });
  links.push({ sourceId: "revenue", targetId: "grossProfit", value: breakdown.grossProfitUsdM });
  links.push({ sourceId: "revenue", targetId: "cogs", value: breakdown.cogsUsdM });

  // Column 3: operating income + total opex (exact partition of gross profit),
  // plus net interest income / other income as independent small inflows.
  const totalOpex = breakdown.sgaUsdM + breakdown.rdUsdM;
  const opIncomeOpexPositions = stack(
    [
      { id: "operatingIncome", value: breakdown.operatingIncomeUsdM },
      { id: "totalOpex", value: totalOpex },
    ],
    y0,
    pxPerUnit,
    0
  );
  nodes.push({ id: "operatingIncome", labelHe: "רווח תפעולי", value: breakdown.operatingIncomeUsdM, column: 3, ...opIncomeOpexPositions.operatingIncome, color: GREEN });
  nodes.push({ id: "totalOpex", labelHe: "סה\"כ הוצאות תפעול", value: totalOpex, column: 3, ...opIncomeOpexPositions.totalOpex, color: RED });
  links.push({ sourceId: "grossProfit", targetId: "operatingIncome", value: breakdown.operatingIncomeUsdM });
  links.push({ sourceId: "grossProfit", targetId: "totalOpex", value: totalOpex });

  const extraIncomeY = opIncomeOpexPositions.totalOpex.y + opIncomeOpexPositions.totalOpex.height + GAP * 2;
  const extraPositions = stack(
    [
      { id: "netInterestIncome", value: breakdown.netInterestIncomeUsdM },
      { id: "otherIncome", value: breakdown.otherIncomeUsdM },
    ],
    extraIncomeY,
    pxPerUnit,
    GAP
  );
  nodes.push({ id: "netInterestIncome", labelHe: "הכנסות מימון נטו", value: breakdown.netInterestIncomeUsdM, column: 3, ...extraPositions.netInterestIncome, color: GREEN });
  nodes.push({ id: "otherIncome", labelHe: "הכנסות אחרות", value: breakdown.otherIncomeUsdM, column: 3, ...extraPositions.otherIncome, color: GREEN });

  // Column 4: pretax income (sum of operating income + the two extra
  // inflows), plus SG&A / R&D as a sub-breakdown of total opex.
  const pretaxPos = stack([{ id: "pretaxIncome", value: breakdown.pretaxIncomeUsdM }], y0, pxPerUnit, 0).pretaxIncome;
  nodes.push({ id: "pretaxIncome", labelHe: "רווח לפני מס", value: breakdown.pretaxIncomeUsdM, column: 4, ...pretaxPos, color: GREEN });
  links.push({ sourceId: "operatingIncome", targetId: "pretaxIncome", value: breakdown.operatingIncomeUsdM });
  links.push({ sourceId: "netInterestIncome", targetId: "pretaxIncome", value: breakdown.netInterestIncomeUsdM });
  links.push({ sourceId: "otherIncome", targetId: "pretaxIncome", value: breakdown.otherIncomeUsdM });

  const opexSubY = pretaxPos.y + pretaxPos.height + GAP * 2;
  const opexSubPositions = stack(
    [
      { id: "sga", value: breakdown.sgaUsdM },
      { id: "rd", value: breakdown.rdUsdM },
    ],
    opexSubY,
    pxPerUnit,
    GAP
  );
  nodes.push({ id: "sga", labelHe: "מכירה והנהלה (SG&A)", value: breakdown.sgaUsdM, column: 4, ...opexSubPositions.sga, color: RED });
  nodes.push({ id: "rd", labelHe: "מו\"פ (R&D)", value: breakdown.rdUsdM, column: 4, ...opexSubPositions.rd, color: RED });
  links.push({ sourceId: "totalOpex", targetId: "sga", value: breakdown.sgaUsdM });
  links.push({ sourceId: "totalOpex", targetId: "rd", value: breakdown.rdUsdM });

  // Column 5: net income + tax + minority interests (exact partition of pretax income)
  const finalPositions = stack(
    [
      { id: "netIncome", value: breakdown.netIncomeUsdM },
      { id: "tax", value: breakdown.taxUsdM },
      { id: "minorityInterests", value: breakdown.minorityInterestsUsdM },
    ],
    y0,
    pxPerUnit,
    0
  );
  nodes.push({ id: "netIncome", labelHe: "רווח נקי", value: breakdown.netIncomeUsdM, column: 5, ...finalPositions.netIncome, color: GREEN });
  nodes.push({ id: "tax", labelHe: "מס", value: breakdown.taxUsdM, column: 5, ...finalPositions.tax, color: RED });
  nodes.push({ id: "minorityInterests", labelHe: "זכויות מיעוט", value: breakdown.minorityInterestsUsdM, column: 5, ...finalPositions.minorityInterests, color: RED });
  links.push({ sourceId: "pretaxIncome", targetId: "netIncome", value: breakdown.netIncomeUsdM });
  links.push({ sourceId: "pretaxIncome", targetId: "tax", value: breakdown.taxUsdM });
  links.push({ sourceId: "pretaxIncome", targetId: "minorityInterests", value: breakdown.minorityInterestsUsdM });

  return { nodes, links };
}

// Builds one ribbon path between a vertical slice of the source node and a
// vertical slice of the target node. Each node's total height is consumed
// by its outgoing/incoming links in order, so slices are computed here
// from cumulative link values per node rather than stored on the node.
function buildRibbons(nodes: FlowNode[], links: FlowLink[]): { d: string; color: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();

  return links.map((link) => {
    const source = byId.get(link.sourceId)!;
    const target = byId.get(link.targetId)!;
    const sPxPerUnit = source.height / source.value;
    const tPxPerUnit = target.height / target.value;

    const sStart = source.y + (outCursor.get(source.id) ?? 0);
    const sHeight = link.value * sPxPerUnit;
    outCursor.set(source.id, (outCursor.get(source.id) ?? 0) + sHeight);

    const tStart = target.y + (inCursor.get(target.id) ?? 0);
    const tHeight = link.value * tPxPerUnit;
    inCursor.set(target.id, (inCursor.get(target.id) ?? 0) + tHeight);

    const x0 = PADDING_LEFT + source.column * COLUMN_SPACING + NODE_WIDTH;
    const x1 = PADDING_LEFT + target.column * COLUMN_SPACING;
    const xMid = (x0 + x1) / 2;

    const d = [
      `M ${x0} ${sStart}`,
      `C ${xMid} ${sStart}, ${xMid} ${tStart}, ${x1} ${tStart}`,
      `L ${x1} ${tStart + tHeight}`,
      `C ${xMid} ${tStart + tHeight}, ${xMid} ${sStart + sHeight}, ${x0} ${sStart + sHeight}`,
      "Z",
    ].join(" ");

    const color = source.color === RED || target.color === RED ? RED : source.color === GREEN ? GREEN : BLUE;
    return { d, color };
  });
}

function FlowChart({ breakdown }: { breakdown: IncomeStatementBreakdown }) {
  const { nodes, links } = buildLayout(breakdown);
  const ribbons = buildRibbons(nodes, links);
  const totalHeight = Math.max(...nodes.map((n) => n.y + n.height)) + PADDING_TOP;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${totalHeight}`} className="w-full" role="img" aria-label="פירוק דוח רווח והפסד">
      {ribbons.map((r, i) => (
        <path key={i} d={r.d} fill={r.color} opacity={0.32} />
      ))}
      {nodes.map((node) => {
        const x = PADDING_LEFT + node.column * COLUMN_SPACING;
        // Every node labels to its own right, into the gap right after
        // its column — never the gap before it. Labeling later columns
        // (>= 4) to their LEFT put those labels in the same gap an
        // earlier column was already filling from the right, so the two
        // sets of text collided in the crowded middle of the diagram.
        // Always going right keeps each column's labels in a gap no
        // other column's labels ever use.
        const labelX = x + NODE_WIDTH + 6;
        return (
          <g key={node.id}>
            <rect x={x} y={node.y} width={NODE_WIDTH} height={node.height} fill={node.color} rx={2} />
            {/* Name, value and percentage written directly on the diagram
                next to each node (GuruFocus-style), not just in a legend:
                bold name on top, bold color-matched $ value + % below it. */}
            <text
              x={labelX}
              y={node.y + node.height / 2 - 5}
              textAnchor="start"
              fontSize="11.5"
              fontWeight={700}
              fill="#f1f5f9"
            >
              {node.labelHe}
            </text>
            <text
              x={labelX}
              y={node.y + node.height / 2 + 11}
              textAnchor="start"
              fontSize="11"
              fontWeight={700}
              fill={node.color}
            >
              {formatUsdM(node.value)}
              <tspan fontWeight={500} fill="#94a3b8">
                {" "}
                ({((node.value / breakdown.revenueUsdM) * 100).toFixed(1)}%)
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface BreakdownRow {
  labelHe: string;
  valueUsdM: number;
  pct: number;
  color: string;
  bold?: boolean;
}

// Builds the full, explicit line-by-line breakdown shown under the flow
// diagram: first the revenue split by segment, then every line of the
// income statement in order (revenue, COGS, gross profit, opex, operating
// income, financing/other income, pretax income, tax, minority interests,
// net income) — each written out in words, with its dollar value and its
// share of total revenue, so the numbers behind the diagram are legible
// even when the ribbons themselves are thin.
function buildBreakdownRows(breakdown: IncomeStatementBreakdown): { segmentRows: BreakdownRow[]; statementRows: BreakdownRow[] } {
  const revenue = breakdown.revenueUsdM;
  const pct = (v: number) => (Math.abs(v) / revenue) * 100;

  const segmentRows: BreakdownRow[] = breakdown.segments.map((s) => ({
    labelHe: s.nameHe,
    valueUsdM: s.valueUsdM,
    pct: s.pctOfRevenue,
    color: BLUE,
  }));

  const statementRows: BreakdownRow[] = [
    { labelHe: "סה\"כ הכנסות", valueUsdM: breakdown.revenueUsdM, pct: 100, color: BLUE, bold: true },
    { labelHe: "עלות המכר (COGS)", valueUsdM: -breakdown.cogsUsdM, pct: pct(breakdown.cogsUsdM), color: RED },
    { labelHe: "רווח גולמי", valueUsdM: breakdown.grossProfitUsdM, pct: pct(breakdown.grossProfitUsdM), color: GREEN, bold: true },
    { labelHe: "מכירה והנהלה (SG&A)", valueUsdM: -breakdown.sgaUsdM, pct: pct(breakdown.sgaUsdM), color: RED },
    { labelHe: "מחקר ופיתוח (R&D)", valueUsdM: -breakdown.rdUsdM, pct: pct(breakdown.rdUsdM), color: RED },
    { labelHe: "רווח תפעולי", valueUsdM: breakdown.operatingIncomeUsdM, pct: pct(breakdown.operatingIncomeUsdM), color: GREEN, bold: true },
    { labelHe: "הכנסות מימון נטו", valueUsdM: breakdown.netInterestIncomeUsdM, pct: pct(breakdown.netInterestIncomeUsdM), color: GREEN },
    { labelHe: "הכנסות אחרות", valueUsdM: breakdown.otherIncomeUsdM, pct: pct(breakdown.otherIncomeUsdM), color: GREEN },
    { labelHe: "רווח לפני מס", valueUsdM: breakdown.pretaxIncomeUsdM, pct: pct(breakdown.pretaxIncomeUsdM), color: GREEN, bold: true },
    { labelHe: "מס", valueUsdM: -breakdown.taxUsdM, pct: pct(breakdown.taxUsdM), color: RED },
    { labelHe: "זכויות מיעוט", valueUsdM: -breakdown.minorityInterestsUsdM, pct: pct(breakdown.minorityInterestsUsdM), color: RED },
    { labelHe: "רווח נקי", valueUsdM: breakdown.netIncomeUsdM, pct: pct(breakdown.netIncomeUsdM), color: GREEN, bold: true },
  ];

  return { segmentRows, statementRows };
}

function BreakdownRowLine({ row }: { row: BreakdownRow }) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-2 rounded px-2 py-1",
        row.bold && "bg-surface-card"
      )}
    >
      <span className={clsx("text-xs", row.bold ? "font-bold" : "font-normal", row.bold ? "text-slate-900" : "text-slate-700")}>
        {row.labelHe}
      </span>
      <span className="flex items-center gap-2 text-xs" style={{ color: row.color }}>
        <span className="font-semibold">{formatUsdM(row.valueUsdM)}</span>
        <span className="text-slate-500">({row.pct.toFixed(1)}%)</span>
      </span>
    </div>
  );
}

// Sankey-style income-statement breakdown ("How <Company> Makes Its
// Money"), with an annual/quarterly toggle: revenue segments flow into
// gross profit vs. COGS, gross profit splits into operating income vs.
// total opex (further broken into SG&A/R&D), and pretax income splits
// into net income, tax, and minority interests. Every split is
// arithmetically reconciled by financial-statements.ts's generator, so
// the ribbon widths always sum correctly.
export function IncomeStatementFlow({ companyNameHe, annual, quarterly }: IncomeStatementFlowProps) {
  const [periodMode, setPeriodMode] = useState<"annual" | "quarterly">("annual");
  const breakdown = periodMode === "annual" ? annual : quarterly;
  const { segmentRows, statementRows } = buildBreakdownRows(breakdown);

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">
          איך {companyNameHe} מרוויחה כסף — {breakdown.periodLabelHe}
        </p>
        <div className="flex rounded-lg border border-surface-border p-0.5">
          <button
            type="button"
            onClick={() => setPeriodMode("annual")}
            className={clsx(
              "rounded-md px-2.5 py-1 text-xs font-medium transition",
              periodMode === "annual" ? "bg-brand-500 text-white" : "text-slate-500 hover:text-slate-800"
            )}
          >
            שנתי
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode("quarterly")}
            className={clsx(
              "rounded-md px-2.5 py-1 text-xs font-medium transition",
              periodMode === "quarterly" ? "bg-brand-500 text-white" : "text-slate-500 hover:text-slate-800"
            )}
          >
            רבעוני
          </button>
        </div>
      </div>
      <FlowChart breakdown={breakdown} />

      {/* Full written breakdown: segments first, then every income-statement
          line in order — each in words, with its $ value and its % of
          total revenue, so the numbers behind the diagram are always
          readable even where the ribbons are thin. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">פירוק הכנסות לפי חטיבות</p>
          <div className="space-y-0.5">
            {segmentRows.map((row, i) => (
              <BreakdownRowLine key={i} row={row} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">כל ההכנסות וההוצאות</p>
          <div className="space-y-0.5">
            {statementRows.map((row, i) => (
              <BreakdownRowLine key={i} row={row} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
