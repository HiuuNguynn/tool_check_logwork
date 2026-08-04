"use client";

import type { DailyRow, IssueRow } from "@/lib/types";
import { formatHours, sum } from "@/lib/report";

type Props = {
  rows: IssueRow[];
  dailyRows: DailyRow[];
  targetHours: number;
};

export function SummaryCards({ rows, dailyRows, targetHours }: Props) {
  const totalActual = sum(rows.map((row) => row.actualHours));
  const invalidTickets = rows.filter((row) => row.violations.length).length;
  // Ngày nghỉ lễ/nghỉ phép không tính là ngày làm việc cần log giờ.
  const workingDays = dailyRows.filter(
    (day) => !day.isWeekend && day.status !== "leave",
  );
  const okDays = dailyRows.filter((day) => day.status === "ok").length;
  const offDays = dailyRows.filter(
    (day) => day.status === "under" || day.status === "over",
  ).length;
  const emptyWorkingDays = workingDays.filter(
    (day) => day.rows.length === 0,
  ).length;

  const acmsConfigured = dailyRows.some((day) => day.projectToolHours !== null);
  const totalProjectTool = acmsConfigured
    ? sum(dailyRows.map((day) => day.projectToolHours))
    : null;
  const totalAttendance = acmsConfigured
    ? sum(dailyRows.map((day) => day.attendanceHours))
    : null;
  const mismatchDays = dailyRows.filter(
    (day) => day.sourceMatch === "mismatch",
  ).length;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Card label="Tổng ticket" value={String(rows.length)} />
      <Card
        label="Tổng Actual hours"
        value={formatHours(totalActual)}
        hint={`Chuẩn ${formatHours(targetHours)}h/ngày`}
      />
      <Card
        label={`Ngày đủ ${formatHours(targetHours)}h`}
        value={String(okDays)}
        tone={okDays > 0 ? "ok" : "neutral"}
      />
      <Card
        label="Ngày lệch giờ"
        value={String(offDays)}
        hint={
          emptyWorkingDays
            ? `gồm ${emptyWorkingDays} ngày chưa log`
            : undefined
        }
        tone={offDays > 0 ? "warn" : "ok"}
      />
      <Card
        label="Ticket sai rule"
        value={String(invalidTickets)}
        tone={invalidTickets > 0 ? "bad" : "ok"}
      />
      <Card
        label="Tổng Time dự án (ACMS)"
        value={totalProjectTool === null ? "—" : formatHours(totalProjectTool)}
        hint={acmsConfigured ? undefined : "Chưa cấu hình ACMS token"}
        tone="neutral"
      />
      <Card
        label="Tổng Chấm công (ACMS)"
        value={totalAttendance === null ? "—" : formatHours(totalAttendance)}
        hint={
          acmsConfigured
            ? mismatchDays
              ? `${mismatchDays} ngày lệch 3 nguồn`
              : undefined
            : "Chưa cấu hình ACMS token"
        }
        tone={acmsConfigured && mismatchDays > 0 ? "warn" : "neutral"}
      />
    </section>
  );
}

const toneClass = {
  neutral: "ring-slate-200",
  ok: "ring-emerald-200 bg-emerald-50/60",
  warn: "ring-amber-200 bg-amber-50/60",
  bad: "ring-rose-200 bg-rose-50/60",
} as const;

function Card({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof toneClass;
}) {
  return (
    <div className={`rounded-xl bg-white p-4 shadow-sm ring-1 ${toneClass[tone]}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
