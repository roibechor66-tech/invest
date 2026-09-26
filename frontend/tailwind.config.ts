import type { Config } from "tailwindcss";

// Tailwind config — "Dense Broker Terminal" theme (Design Option E, chosen
// 2026-09-23): a functional, professional-broker look inspired by
// institutional trading platforms (IBKR Client Portal-style): dense data
// tables, sharp corners, monospace figures, a single red accent.
//
// Dark-mode-by-default (chosen 2026-09-23, later the same day): every
// component in this app addresses colors only through these named tokens
// (surface.*, brand.*, slate.{300,400,500,600,700,800,900}, positive,
// negative — confirmed by grep across every .tsx file before this change),
// never a raw hex literal. So flipping the whole app's default theme from
// light to dark is done ENTIRELY here, by pointing each token at a
// dark-mode-appropriate value, instead of touching any of the ~60
// component files that reference them. No light/dark toggle exists (or is
// wanted) here — this simply replaces the old light values outright, the
// same way the original light theme replaced an even earlier dark
// placeholder. The specific dark hex values reuse the palette already
// designed, verified for contrast, and shipped in the Design-canvas demo's
// dark-mode toggle (see CLAUDE.md #28) — this keeps the real site and the
// demo visually identical in dark mode.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // Full override (not extend) — collapses Tailwind's default rounded-*
    // scale down to near-sharp corners everywhere in the app in one place,
    // matching the terminal's minimal-decoration look, without having to
    // touch every component's className.
    borderRadius: {
      none: "0px",
      sm: "1px",
      DEFAULT: "2px",
      md: "2px",
      lg: "3px",
      xl: "4px",
      "2xl": "4px",
      "3xl": "6px",
      full: "9999px",
    },
    extend: {
      colors: {
        // Brand/interactive color. Only 300/400/500/600 are ever referenced
        // by a class name in this app (confirmed by grep) — 50/100/200/700/
        // 800/900 are kept from the original navy scale for completeness but
        // are effectively unused. On a dark background the original navy
        // (500: #0a2540) reads as almost-black-on-almost-black, so 300-600
        // are swapped for a brighter blue that actually pops — the same
        // interactive-blue the demo's dark theme uses.
        brand: {
          50: "#eef2f6",
          100: "#dce6ee",
          200: "#b8ccdd",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#061929",
          800: "#04131f",
          900: "#030d15",
        },
        // Single sparing red accent — header stripe, negative values, key CTAs.
        accent: {
          400: "#d9435c",
          500: "#c8102e",
          600: "#a80d26",
          700: "#8a0a1f",
        },
        // Dark surface scale: page background -> card -> raised/input -> border.
        surface: {
          DEFAULT: "#0f1115",
          card: "#171a21",
          raised: "#1e222b",
          muted: "#1e222b",
          border: "#272b35",
        },
        positive: "#34c77b",
        negative: "#f0576a",
        // Tailwind's own gray scale is used directly for text/dividers
        // throughout the app (text-slate-500/600/700/800/900, bg-slate-
        // 400/500 — no other shade is referenced for text/surfaces). Deep-
        // merged over Tailwind's default slate scale, so only these get
        // remapped to light-on-dark values; 50-200 stay at their defaults
        // (unused here, but left intact for anything added later). 300 is
        // deliberately NOT remapped: its one use (SectorHeatmapModal's hover
        // ring) sits on top of saturated per-sector tile colors, not on a
        // page surface, so it should stay Tailwind's light default rather
        // than follow the dark-surface text logic below.
        slate: {
          400: "#64748b",
          500: "#94a3b8",
          600: "#a8b6c8",
          700: "#cbd5e1",
          800: "#e2e8f0",
          900: "#f1f5f9",
        },
      },
      fontFamily: {
        sans: ["Heebo", "Assistant", "Arial", "sans-serif"],
        // For prices, quantities, tickers, timestamps — anywhere figures
        // should read as tabular/terminal-like data, not prose.
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
