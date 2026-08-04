"use client";

import { useMemo, useState } from "react";

import { sourceMatchStyle } from "./DailyTable";
import { weekdayLabel } from "@/lib/date";
import { formatHours, round2, sameHours } from "@/lib/report";
import type { DailyRow, SourceMatchStatus } from "@/lib/types";

type Props = {
  days: DailyRow[];
};

/** Tab này chỉ so Time dự án với Chấm công, không tính Actual Hours Backlog vào. */
function attendanceMatch(day: DailyRow): SourceMatchStatus {
  if (day.projectToolHours === null || day.attendanceHours === null) {
    return "unavailable";
  }
  return sameHours(day.projectToolHours, day.attendanceHours) ? "match" : "mismatch";
}

function spread(day: DailyRow): number | null {
  if (day.projectToolHours === null || day.attendanceHours === null) return null;
  return round2(Math.abs(day.projectToolHours - day.attendanceHours));
}

export function AttendanceCompareTable({ days }: Props) {
  const [onlyMismatch, setOnlyMismatch] = useState(false);

  const rows = useMemo(
    () => days.map((day) => ({ day, match: attendanceMatch(day) })),
    [days],
  );
  const acmsConfigured = rows.some(({ match }) => match !== "unavailable");
  const mismatchCount = rows.filter(({ match }) => match === "mismatch").length;

  const visibleRows = useMemo(
    () => (onlyMismatch ? rows.filter(({ match }) => match === "mismatch") : rows),
    [rows, onlyMismatch],
  );

  if (!acmsConfigured) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Chưa cấu hình ACMS token nên không có dữ liệu để đối chiếu. Vào{" "}
        <strong>Cài đặt</strong> để nhập token chấm công + time dự án.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyMismatch}
            onChange={(event) => setOnlyMismatch(event.target.checked)}
            className="size-4 accent-slate-800"
          />
          Chỉ hiện ngày lệch
        </label>
        <p className="text-sm text-slate-500">
          {mismatchCount > 0 ? (
            <span className="font-medium text-rose-700">
              {mismatchCount} ngày lệch
            </span>
          ) : (
            "Không có ngày nào lệch"
          )}{" "}
          / {days.length} ngày
        </p>
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Không có ngày nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-xl border-collapse text-sm">
            <thead className="sticky-head bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-36 px-3 py-2 font-medium">Ngày</th>
                <th className="w-16 px-3 py-2 font-medium">Thứ</th>
                <th className="w-32 px-3 py-2 text-right font-medium">
                  Time dự án (ACMS)
                </th>
                <th className="w-32 px-3 py-2 text-right font-medium">
                  Chấm công (ACMS)
                </th>
                <th className="w-28 px-3 py-2 text-right font-medium">
                  Chênh lệch
                </th>
                <th className="w-28 px-3 py-2 font-medium">Đối chiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map(({ day, match }) => {
                const bad = match === "mismatch";
                const cellClass = bad
                  ? "bg-rose-100 font-semibold text-rose-900"
                  : "text-slate-700";
                return (
                  <tr key={day.date} className={bad ? "bg-rose-50/40" : undefined}>
                    <td className="px-3 py-2 font-medium tabular-nums">
                      {day.date}
                    </td>
                    <td
                      className={`px-3 py-2 ${day.isWeekend ? "text-slate-400" : "text-slate-600"}`}
                    >
                      {weekdayLabel(day.date)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${cellClass}`}>
                      {formatHours(day.projectToolHours)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${cellClass}`}>
                      {formatHours(day.attendanceHours)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {formatHours(spread(day))}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceMatchStyle[match].badge}`}
                      >
                        {sourceMatchStyle[match].text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
