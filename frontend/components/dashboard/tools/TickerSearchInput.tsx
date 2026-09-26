"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { TickerSuggestion } from "@/lib/ticker-search";

interface TickerSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: TickerSuggestion[];
  onSelectSuggestion: (suggestion: TickerSuggestion) => void;
  // For a search box NOT wrapped in its own <form> (its Enter key has
  // nothing else to fall through to): called with the raw input value
  // when Enter is pressed and no suggestion is highlighted. A box that
  // already submits on Enter via a surrounding <form> should leave this
  // unset, so Enter isn't handled twice (once here, once by the form).
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  dir?: "ltr" | "rtl";
}

// Autocomplete dropdown for the app's ticker search boxes: as the user
// types, up to a handful of matching tickers/names appear below the
// input. Arrow keys move a highlight, Enter picks the highlighted
// suggestion (or falls through to the surrounding <form>'s onSubmit —
// or to this component's own `onSubmit` prop, for a box with no
// <form> — which runs the box's own search-by-ticker logic), and a
// mouse click on a suggestion selects it immediately.
export function TickerSearchInput({
  value,
  onChange,
  suggestions,
  onSelectSuggestion,
  onSubmit,
  placeholder,
  className,
  inputClassName,
  id,
  dir,
}: TickerSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(suggestion: TickerSuggestion) {
    onSelectSuggestion(suggestion);
    setIsOpen(false);
    setHighlightIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && isOpen && suggestions.length > 0) {
      event.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && isOpen && suggestions.length > 0) {
      event.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (event.key === "Enter") {
      if (isOpen && highlightIndex >= 0 && suggestions[highlightIndex]) {
        // A suggestion is highlighted via arrow keys: pick it instead of
        // submitting whatever raw text is still in the box.
        event.preventDefault();
        selectSuggestion(suggestions[highlightIndex]);
      } else if (onSubmit) {
        // No <form> around this box to fall through to — run the
        // box's own search directly.
        event.preventDefault();
        setIsOpen(false);
        onSubmit(value);
      }
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  const defaultInputClassName =
    "flex-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500";

  return (
    <div ref={containerRef} className={`relative ${className ?? "flex-1"}`}>
      <input
        id={id}
        type="text"
        dir={dir}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => value && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName ?? defaultInputClassName}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-surface-border bg-surface-card shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.ticker}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition ${
                  index === highlightIndex
                    ? "bg-brand-500/15 text-brand-500"
                    : "text-slate-800 hover:bg-surface-raised"
                }`}
              >
                <span className="truncate text-slate-500">{suggestion.nameHe}</span>
                <span className="font-semibold" dir="ltr">
                  {suggestion.ticker}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
