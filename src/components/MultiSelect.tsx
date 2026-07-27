"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Option = { value: number; label: string; hint?: string };

type Props = {
  label: string;
  options: Option[];
  selected: number[];
  onChange: (values: number[]) => void;
  emptyLabel: string;
  disabled?: boolean;
  searchable?: boolean;
};

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyLabel,
  disabled,
  searchable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const summary = useMemo(() => {
    if (!selected.length) return emptyLabel;
    const labels = selected
      .map((value) => options.find((option) => option.value === value)?.label)
      .filter(Boolean) as string[];
    if (!labels.length) return emptyLabel;
    if (labels.length <= 2) return labels.join(", ");
    return `${labels[0]} +${labels.length - 1}`;
  }, [selected, options, emptyLabel]);

  function toggle(value: number) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className={selected.length ? "truncate" : "truncate text-slate-500"}>
          {summary}
        </span>
        <span className="text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 rounded-md border border-slate-200 bg-white shadow-lg">
          {searchable && (
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm…"
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-slate-400"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">Không có mục nào</p>
            )}
            {filtered.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className="size-4 accent-slate-800"
                />
                <span className="truncate">{option.label}</span>
                {option.hint && (
                  <span className="ml-auto shrink-0 text-xs text-slate-400">
                    {option.hint}
                  </span>
                )}
              </label>
            ))}
          </div>
          <div className="flex justify-between border-t border-slate-100 px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => onChange(filtered.map((option) => option.value))}
              className="text-slate-600 hover:underline"
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-slate-600 hover:underline"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
