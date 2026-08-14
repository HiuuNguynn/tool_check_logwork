"use client";

import { weekdayLabel } from "@/lib/date";
import { formatHours } from "@/lib/report";
import type { MemberDayCell, MemberRow } from "@/lib/types";

export type SelectedCell = { userId: number; date: string };

type Props = {
  rows: MemberRow[];
  selected: SelectedCell | null;
  onSelectCell: (cell: SelectedCell | null) => void;
};

const cellStyle: Record<MemberDayCell["status"], string> = {
  ok: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  violation: "bg-rose-100 text-rose-800 hover:bg-rose-200",
  missing: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  weekend: "bg-slate-50 text-slate-300",
};

export function PmMatrix({ rows, selected, onSelectCell }: Props) {
  if (!rows.length) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Project chưa có thành viên nào.
      </div>
    );
  }

  const dates = rows[0].cells.map((cell) => cell.date);

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 min-w-48 bg-slate-100 px-3 py-2 font-medium">
              Thành viên
            </th>
            <th className="w-24 px-3 py-2 text-right font-medium">Tổng giờ</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Thiếu log</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Sai rule</th>
            {dates.map((date) => (
              <th key={date} className="min-w-16 px-1 py-2 text-center font-medium">
                <div>
                  {date.slice(8, 10)}/{date.slice(5, 7)}
                </div>
                <div className="text-[10px] font-normal text-slate-400">
                  {weekdayLabel(date)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.userId}>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">
                {row.userName}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                {formatHours(row.totalActual)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  row.missingDays > 0 ? "font-semibold text-amber-700" : "text-slate-400"
                }`}
              >
                {row.missingDays}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  row.violationDays > 0 ? "font-semibold text-rose-700" : "text-slate-400"
                }`}
              >
                {row.violationDays}
              </td>
              {row.cells.map((cell) => {
                const isSelected =
                  selected?.userId === row.userId && selected?.date === cell.date;
                return (
                  <td key={cell.date} className="px-1 py-1 text-center">
                    <button
                      type="button"
                      disabled={cell.status === "weekend"}
                      onClick={() =>
                        onSelectCell(isSelected ? null : { userId: row.userId, date: cell.date })
                      }
                      title={cell.violations.map((violation) => violation.message).join("; ")}
                      className={`h-8 w-full rounded text-xs tabular-nums ${cellStyle[cell.status]} ${
                        isSelected ? "ring-2 ring-slate-900" : ""
                      } disabled:cursor-default`}
                    >
                      {cell.status === "weekend"
                        ? ""
                        : cell.ticketCount === 0
                          ? "—"
                          : formatHours(cell.totalActual)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
