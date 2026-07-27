"use client";

import { formatHours } from "@/lib/report";
import type { IssueRow, RuleCode } from "@/lib/types";

type Props = {
  rows: IssueRow[];
  domain: string;
};

/** Ô lệch rule được tô nền để nhìn ra ngay cột nào sai. */
const dateCodes: RuleCode[] = ["MISSING_DATE", "DATE_MISMATCH"];
const hourCodes: RuleCode[] = ["MISSING_HOURS", "HOURS_MISMATCH"];

function hasAny(row: IssueRow, codes: RuleCode[]): boolean {
  return row.violations.some((violation) => codes.includes(violation.code));
}

export function TicketTable({ rows, domain }: Props) {
  if (!rows.length) {
    return <Empty />;
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full min-w-5xl border-collapse text-sm">
        <thead className="sticky-head bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <Th className="w-32">Key</Th>
            <Th className="min-w-64">Summary</Th>
            <Th className="w-28">Start Date</Th>
            <Th className="w-28">Due Date</Th>
            <Th className="w-32">Actual End-date</Th>
            <Th className="w-24 text-right">Estimate</Th>
            <Th className="w-24 text-right">Actual</Th>
            <Th className="w-28 text-right">Re-estimate</Th>
            <Th className="w-28">Status</Th>
            <Th className="min-w-56">Rule</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const dateBad = hasAny(row, dateCodes);
            const hourBad = hasAny(row, hourCodes);
            return (
              <tr
                key={row.id}
                className={row.violations.length ? "bg-rose-50/40" : undefined}
              >
                <Td>
                  <a
                    href={`https://${domain}/view/${row.issueKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {row.issueKey}
                  </a>
                </Td>
                <Td className="max-w-md">
                  <span className="line-clamp-2 text-slate-700" title={row.summary}>
                    {row.summary}
                  </span>
                </Td>
                <Td bad={dateBad}>{row.startDate ?? "—"}</Td>
                <Td bad={dateBad}>{row.dueDate ?? "—"}</Td>
                <Td bad={dateBad && row.supportsActualEnd}>
                  {row.supportsActualEnd ? (row.actualEndDate ?? "—") : <NotAvailable />}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatHours(row.estimatedHours)}
                </Td>
                <Td bad={hourBad} className="text-right tabular-nums">
                  {formatHours(row.actualHours)}
                </Td>
                <Td
                  bad={hourBad && row.supportsReEstimate}
                  className="text-right tabular-nums"
                >
                  {row.supportsReEstimate ? (
                    formatHours(row.reEstimateHours)
                  ) : (
                    <NotAvailable />
                  )}
                </Td>
                <Td className="text-slate-600">{row.statusName}</Td>
                <Td>
                  {row.violations.length === 0 ? (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Hợp lệ
                    </span>
                  ) : (
                    <ul className="space-y-0.5">
                      {row.violations.map((violation) => (
                        <li
                          key={violation.code}
                          className="text-xs text-rose-700"
                        >
                          • {violation.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NotAvailable() {
  return (
    <span
      className="text-slate-400"
      title="Project này không khai báo custom field tương ứng nên không tính vào rule"
    >
      n/a
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function Td({
  children,
  className = "",
  bad = false,
}: {
  children: React.ReactNode;
  className?: string;
  bad?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 align-top ${bad ? "bg-rose-100/70 font-medium text-rose-900" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Empty() {
  return (
    <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
      Không có ticket nào khớp bộ lọc.
    </div>
  );
}
