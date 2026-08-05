"use client";

import { MultiSelect, type Option } from "./MultiSelect";
import {
  firstDayOfMonth,
  lastDayOfMonth,
  shiftDays,
  todayKey,
} from "@/lib/date";

export const STATUS_OPTIONS: Option[] = [
  { value: 1, label: "Open" },
  { value: 2, label: "In Progress" },
  { value: 3, label: "Resolved" },
  { value: 4, label: "Closed" },
];

export type Filters = {
  projectIds: number[];
  assigneeIds: number[];
  statusIds: number[];
  from: string;
  to: string;
  includeEmptyDays: boolean;
  includeWeekends: boolean;
  onlyViolations: boolean;
};

export function defaultFilters(): Filters {
  const today = todayKey();
  return {
    projectIds: [],
    assigneeIds: [],
    statusIds: [1, 2, 3, 4],
    from: firstDayOfMonth(today),
    to: lastDayOfMonth(today),
    includeEmptyDays: true,
    includeWeekends: false,
    onlyViolations: false,
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseIdList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

/** Đọc tối thiểu một giao diện URLSearchParams/ReadonlyURLSearchParams. */
type SearchParamsLike = { get(key: string): string | null; has(key: string): boolean };

/** null nếu URL không có bộ lọc nào từng được lưu (lần đầu mở trang). */
export function filtersFromSearchParams(params: SearchParamsLike): Filters | null {
  if (!params.has("from")) return null;
  const base = defaultFilters();
  const from = params.get("from");
  const to = params.get("to");
  return {
    projectIds: parseIdList(params.get("projectIds")),
    assigneeIds: parseIdList(params.get("assigneeIds")),
    statusIds: params.has("statusIds")
      ? parseIdList(params.get("statusIds"))
      : base.statusIds,
    from: from && DATE_PATTERN.test(from) ? from : base.from,
    to: to && DATE_PATTERN.test(to) ? to : base.to,
    includeEmptyDays: parseBool(params.get("emptyDays"), base.includeEmptyDays),
    includeWeekends: parseBool(params.get("weekends"), base.includeWeekends),
    onlyViolations: parseBool(params.get("onlyViolations"), base.onlyViolations),
  };
}

export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("projectIds", filters.projectIds.join(","));
  params.set("assigneeIds", filters.assigneeIds.join(","));
  params.set("statusIds", filters.statusIds.join(","));
  params.set("from", filters.from);
  params.set("to", filters.to);
  params.set("emptyDays", filters.includeEmptyDays ? "1" : "0");
  params.set("weekends", filters.includeWeekends ? "1" : "0");
  params.set("onlyViolations", filters.onlyViolations ? "1" : "0");
  return params;
}

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  projects: Option[];
  users: Option[];
  usersLoading: boolean;
  loading: boolean;
  onSubmit: () => void;
};

export function FilterBar({
  filters,
  onChange,
  projects,
  users,
  usersLoading,
  loading,
  onSubmit,
}: Props) {
  function patch(partial: Partial<Filters>) {
    onChange({ ...filters, ...partial });
  }

  function applyMonthOffset(offset: number) {
    const today = todayKey();
    const [year, month] = today.split("-").map(Number);
    const anchor = new Date(Date.UTC(year, month - 1 + offset, 1))
      .toISOString()
      .slice(0, 10);
    patch({ from: firstDayOfMonth(anchor), to: lastDayOfMonth(anchor) });
  }

  function applyMonth(monthValue: string) {
    if (!/^\d{4}-\d{2}$/.test(monthValue)) return;
    const anchor = `${monthValue}-01`;
    patch({ from: firstDayOfMonth(anchor), to: lastDayOfMonth(anchor) });
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MultiSelect
          label="Project"
          options={projects}
          selected={filters.projectIds}
          onChange={(projectIds) => patch({ projectIds })}
          emptyLabel="Tất cả project"
        />
        <MultiSelect
          label="Người thực hiện"
          options={users}
          selected={filters.assigneeIds}
          onChange={(assigneeIds) => patch({ assigneeIds })}
          emptyLabel={usersLoading ? "Đang tải…" : "Tất cả thành viên"}
          disabled={usersLoading}
        />
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Từ ngày
          </span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => patch({ from: event.target.value })}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Đến ngày
          </span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => patch({ to: event.target.value })}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Nhanh:</span>
        <QuickButton onClick={() => applyMonthOffset(0)}>Tháng này</QuickButton>
        <QuickButton onClick={() => applyMonthOffset(-1)}>
          Tháng trước
        </QuickButton>
        <QuickButton
          onClick={() => patch({ from: shiftDays(todayKey(), -6), to: todayKey() })}
        >
          7 ngày gần nhất
        </QuickButton>
        <label className="flex items-center gap-1.5 text-slate-500">
          Chọn tháng khác:
          <input
            type="month"
            value={filters.from.slice(0, 7)}
            onChange={(event) => applyMonth(event.target.value)}
            className="h-7 rounded-full border border-slate-200 px-2 text-xs text-slate-600"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-56">
            <MultiSelect
              label="Trạng thái"
              options={STATUS_OPTIONS}
              selected={filters.statusIds}
              onChange={(statusIds) => patch({ statusIds })}
              emptyLabel="Tất cả trạng thái"
              searchable={false}
            />
          </div>
          <Toggle
            checked={filters.includeEmptyDays}
            onChange={(includeEmptyDays) => patch({ includeEmptyDays })}
            label="Hiện cả ngày không có ticket"
          />
          <Toggle
            checked={filters.includeWeekends}
            onChange={(includeWeekends) => patch({ includeWeekends })}
            label="Tính cả T7/CN"
          />
          <Toggle
            checked={filters.onlyViolations}
            onChange={(onlyViolations) => patch({ onlyViolations })}
            label="Chỉ ticket sai rule"
          />
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="h-9 rounded-md bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Đang tải…" : "Thống kê"}
        </button>
      </div>
    </section>
  );
}

function QuickButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-slate-800"
      />
      {label}
    </label>
  );
}
