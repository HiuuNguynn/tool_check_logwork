"use client";

import { Fragment, useState } from "react";

import { weekdayLabel } from "@/lib/date";
import { formatHours } from "@/lib/report";
import type { DailyRow, DayStatus, LeaveType, SourceMatchStatus } from "@/lib/types";

export function leaveLabel(leaveType: LeaveType): string {
  if (leaveType === "holiday") return "Nghỉ lễ";
  if (leaveType === "paid_leave") return "Nghỉ phép";
  if (leaveType === "unpaid_leave") return "Nghỉ không lương";
  return "";
}

type Props = {
  days: DailyRow[];
  domain: string;
  targetHours: number;
};

export const sourceMatchStyle: Record<
  SourceMatchStatus,
  { badge: string; text: string }
> = {
  match: { badge: "bg-emerald-100 text-emerald-800", text: "Khớp" },
  mismatch: { badge: "bg-rose-100 text-rose-800", text: "Lệch" },
  unavailable: { badge: "bg-slate-200 text-slate-500", text: "Chưa cấu hình" },
  leave: { badge: "bg-sky-100 text-sky-800", text: "Nghỉ" },
};

const statusStyle: Record<DayStatus, { row: string; badge: string; text: string }> =
  {
    ok: {
      row: "bg-emerald-50",
      badge: "bg-emerald-100 text-emerald-800",
      text: "Đủ giờ",
    },
    under: {
      row: "bg-rose-50",
      badge: "bg-rose-100 text-rose-800",
      text: "Thiếu giờ",
    },
    over: {
      row: "bg-amber-50",
      badge: "bg-amber-100 text-amber-900",
      text: "Dư giờ",
    },
    empty: {
      row: "bg-slate-50",
      badge: "bg-slate-200 text-slate-600",
      text: "Chưa log",
    },
    leave: {
      row: "bg-sky-50",
      badge: "bg-sky-100 text-sky-800",
      text: "Nghỉ",
    },
  };

export function DailyTable({ days, domain, targetHours }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!days.length) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Không có ngày nào trong khoảng đã chọn.
      </div>
    );
  }

  function toggle(date: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full min-w-3xl border-collapse text-sm">
        <thead className="sticky-head bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2" />
            <th className="w-36 px-3 py-2 font-medium">Ngày</th>
            <th className="w-16 px-3 py-2 font-medium">Thứ</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Ticket</th>
            <th className="w-32 px-3 py-2 text-right font-medium">
              Actual hours (Backlog)
            </th>
            <th className="w-32 px-3 py-2 text-right font-medium">
              Time dự án (ACMS)
            </th>
            <th className="w-32 px-3 py-2 text-right font-medium">
              Chấm công (ACMS)
            </th>
            <th className="w-32 px-3 py-2 text-right font-medium">
              Lệch so với {formatHours(targetHours)}h
            </th>
            <th className="px-3 py-2 font-medium">Kết quả</th>
            <th className="w-32 px-3 py-2 font-medium">Đối chiếu 3 nguồn</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {days.map((day) => {
            const style = statusStyle[day.status];
            const isOpen = expanded.has(day.date);
            const canExpand = day.rows.length > 0 || day.projectToolRows.length > 0;
            return (
              <Fragment key={day.date}>
                <tr
                  className={`${style.row} ${canExpand ? "cursor-pointer" : ""}`}
                  onClick={canExpand ? () => toggle(day.date) : undefined}
                >
                  <td className="px-3 py-2 text-slate-400">
                    {canExpand ? (isOpen ? "▾" : "▸") : ""}
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">
                    {day.date}
                    {day.isRemote && (
                      <span
                        className="ml-1.5 inline-flex rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
                        title="Làm remote — vẫn tính vào rule như ngày làm việc bình thường"
                      >
                        Remote
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 ${day.isWeekend ? "text-slate-400" : "text-slate-600"}`}
                  >
                    {weekdayLabel(day.date)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {day.rows.length}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${day.sourceMatch === "mismatch" ? "bg-rose-100 text-rose-900" : ""}`}
                  >
                    {formatHours(day.totalActual)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${day.sourceMatch === "mismatch" ? "bg-rose-100 font-semibold text-rose-900" : "text-slate-700"}`}
                  >
                    {formatHours(day.projectToolHours)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${day.sourceMatch === "mismatch" ? "bg-rose-100 font-semibold text-rose-900" : "text-slate-700"}`}
                  >
                    {formatHours(day.attendanceHours)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${day.diff === 0 ? "text-slate-500" : "font-semibold"}`}
                  >
                    {day.status === "empty" || day.status === "leave"
                      ? "—"
                      : `${day.diff > 0 ? "+" : ""}${formatHours(day.diff)}`}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
                    >
                      {day.status === "leave"
                        ? leaveLabel(day.leaveType)
                        : day.rows.length === 0
                          ? day.isWeekend
                            ? "Cuối tuần"
                            : "Chưa log giờ"
                          : style.text}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceMatchStyle[day.sourceMatch].badge}`}
                    >
                      {day.sourceMatch === "leave"
                        ? leaveLabel(day.leaveType)
                        : sourceMatchStyle[day.sourceMatch].text}
                    </span>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="bg-white">
                    <td colSpan={10} className="space-y-3 px-3 py-2">
                      {day.rows.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Backlog
                          </p>
                          <table className="w-full text-xs">
                            <tbody>
                              {day.rows.map((row) => (
                                <tr
                                  key={row.id}
                                  className="border-b border-slate-100 last:border-0"
                                >
                                  <td className="w-32 py-1.5 pr-3">
                                    <a
                                      href={`https://${domain}/view/${row.issueKey}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-blue-700 hover:underline"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {row.issueKey}
                                    </a>
                                  </td>
                                  <td className="py-1.5 pr-3 text-slate-600">
                                    {row.summary}
                                  </td>
                                  <td className="w-24 py-1.5 text-right tabular-nums text-slate-700">
                                    {formatHours(row.actualHours)}h
                                  </td>
                                  <td className="w-40 py-1.5 pl-3 text-rose-700">
                                    {row.violations
                                      .map((violation) => violation.message)
                                      .join("; ")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {day.projectToolRows.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Time dự án (ACMS)
                          </p>
                          <table className="w-full text-xs">
                            <tbody>
                              {day.projectToolRows.map((entry, index) => (
                                <tr
                                  key={index}
                                  className="border-b border-slate-100 last:border-0"
                                >
                                  <td className="w-32 py-1.5 pr-3">
                                    {entry.issueKey ? (
                                      <a
                                        href={
                                          entry.linkBacklog ??
                                          `https://${domain}/view/${entry.issueKey}`
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-blue-700 hover:underline"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        {entry.issueKey}
                                      </a>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-slate-600">
                                    {entry.title}
                                    {entry.projectName && (
                                      <span className="ml-1.5 text-slate-400">
                                        ({entry.projectName})
                                      </span>
                                    )}
                                  </td>
                                  <td className="w-24 py-1.5 text-right tabular-nums text-slate-700">
                                    {formatHours(entry.actualTime)}h
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
