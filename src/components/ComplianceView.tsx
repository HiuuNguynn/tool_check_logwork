"use client";

import { Fragment, useState } from "react";

import { COMPLIANCE_THRESHOLD } from "@/lib/compliance";
import type { ComplianceCode, MemberCompliance } from "@/lib/types";

type Props = {
  members: MemberCompliance[];
  /** Khoảng ngày đã dùng để lọc subtask. */
  range: { from: string; to: string };
  domain: string;
  /** Có ít nhất 1 subtask thuộc project đã tạo field Reschedule. */
  hasRescheduleField: boolean;
  dueHistory: {
    /** Số subtask đã đọc lịch sử sửa Due Date / tổng số subtask được kiểm tra. */
    read: number;
    total: number;
    loading: boolean;
    error: string | null;
    /** Số subtask tối đa mỗi lượt đọc. */
    limit: number;
  };
  onLoadDueHistory: () => void;
};

const CODE_LABELS: { code: ComplianceCode; label: string }[] = [
  { code: "NO_ASSIGNEE", label: "Chưa gán người" },
  { code: "NO_DUE_DATE", label: "Thiếu Due" },
  { code: "NO_ACTUAL_END", label: "Closed thiếu Actual End" },
  { code: "END_BEFORE_START", label: "End < Start" },
  { code: "DUE_EDITED", label: "Sửa Due" },
  { code: "RESCHEDULE_NO_REASON", label: "Dời thiếu Reason" },
  { code: "RESCHEDULE_NO_EVIDENCE", label: "Nhóm E thiếu Evidence" },
];

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export function ComplianceView({
  members,
  range,
  domain,
  hasRescheduleField,
  dueHistory,
  onLoadDueHistory,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const total = members.reduce((acc, member) => acc + member.total, 0);
  const compliant = members.reduce((acc, member) => acc + member.compliant, 0);
  const below = members.filter((member) => member.rate < COMPLIANCE_THRESHOLD).length;
  const remaining = dueHistory.total - dueHistory.read;

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Subtask được kiểm tra" value={String(total)} />
        <Stat label="Đúng quy định" value={String(compliant)} tone="emerald" />
        <Stat label="Có lỗi dữ liệu" value={String(total - compliant)} tone="rose" />
        <Stat
          label={`Người dưới ${percent(COMPLIANCE_THRESHOLD)}`}
          value={String(below)}
          tone="amber"
        />
      </div>

      <div className="space-y-2 rounded-xl bg-white p-4 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200">
        <p>
          Kiểm tra subtask từ <strong>{range.from}</strong> đến <strong>{range.to}</strong>{" "}
          theo Guideline đo Performance (Trục Tiến độ). Subtask được xếp vào ngày theo Actual
          End-date, thiếu thì Due Date rồi Start Date; chưa điền ngày nào thì chỉ tính khi còn
          mở. Không tính ticket Bug/Feedback và subtask đã Cancel. Tỷ lệ tuân thủ dưới{" "}
          {percent(COMPLIANCE_THRESHOLD)} thì kết quả tiến độ của kỳ cần PQA xác nhận lại.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLoadDueHistory}
            disabled={dueHistory.loading || remaining === 0}
            className="h-8 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {dueHistory.loading
              ? "Đang đọc lịch sử…"
              : dueHistory.read === 0
                ? "Kiểm tra lịch sử sửa Due Date"
                : remaining > 0
                  ? `Đọc tiếp (còn ${remaining} subtask)`
                  : "Đã đọc đủ lịch sử"}
          </button>
          <span>
            {dueHistory.read === 0
              ? `Chưa tính lỗi sửa Due Date — mỗi subtask tốn ít nhất 1 request Backlog (giới hạn 600 request/phút) nên chỉ đọc khi bấm, mỗi lượt tối đa ${dueHistory.limit} subtask.`
              : `Đã đọc lịch sử ${dueHistory.read}/${dueHistory.total} subtask. Lỗi sửa Due Date sau ngày đặt hạn ban đầu (đáng lẽ phải dùng Reschedule) chỉ tính cho subtask đã đọc.`}
          </span>
        </div>
        {dueHistory.error && <p className="text-rose-700">{dueHistory.error}</p>}
        {!hasRescheduleField && (
          <p className="text-amber-800">
            Project chưa tạo field <strong>Reschedule / Reschedule Reason / Reschedule
            Evidence</strong> nên chưa kiểm tra được quy trình dời hạn.
          </p>
        )}
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Không có subtask nào để kiểm tra trong các G-Task đang hiển thị.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-4xl border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Người phụ trách</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Subtask</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Đúng</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Tỷ lệ</th>
                <th className="px-3 py-2 font-medium">Lỗi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((member) => {
                const key = String(member.assigneeId);
                const isOpen = expanded.has(key);
                const failing = member.checks.filter((check) => check.violations.length);
                const counts = CODE_LABELS.map(({ code, label }) => ({
                  label,
                  count: failing.filter((check) =>
                    check.violations.some((violation) => violation.code === code),
                  ).length,
                })).filter((item) => item.count > 0);
                const low = member.rate < COMPLIANCE_THRESHOLD;

                return (
                  <Fragment key={key}>
                    <tr>
                      <td className="px-3 py-2 pr-0 align-top">
                        {failing.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={isOpen}
                            title={isOpen ? "Ẩn subtask lỗi" : "Xem subtask lỗi"}
                            className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">{member.assigneeName}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">{member.total}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {member.compliant}
                      </td>
                      <td
                        className={`px-3 py-2 text-right align-top font-semibold tabular-nums ${
                          low ? "bg-rose-100/80 text-rose-800" : "text-emerald-700"
                        }`}
                      >
                        {percent(member.rate)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          {counts.map((item) => (
                            <span
                              key={item.label}
                              className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-800 ring-1 ring-rose-200"
                            >
                              {item.label}: {item.count}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={6} className="py-2 pr-3 pl-11">
                          <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                                <tr>
                                  <th className="w-32 py-1 pr-3 font-medium">Subtask</th>
                                  <th className="w-28 py-1 pr-3 font-medium">G-Task</th>
                                  <th className="py-1 pr-3 font-medium">Summary</th>
                                  <th className="w-24 py-1 pr-3 font-medium">Status</th>
                                  <th className="w-72 py-1 font-medium">Lỗi dữ liệu</th>
                                </tr>
                              </thead>
                              <tbody>
                                {failing.map((check) => (
                                  <tr key={check.task.id} className="border-t border-slate-200/70">
                                    <td className="py-1.5 pr-3">
                                      <IssueLink domain={domain} issueKey={check.task.issueKey} />
                                    </td>
                                    <td className="py-1.5 pr-3">
                                      <IssueLink domain={domain} issueKey={check.groupTaskKey} />
                                    </td>
                                    <td className="py-1.5 pr-3 text-slate-600">
                                      <span className="line-clamp-1" title={check.task.summary}>
                                        {check.task.summary}
                                      </span>
                                    </td>
                                    <td className="py-1.5 pr-3 text-slate-600">
                                      {check.task.statusName}
                                    </td>
                                    <td className="py-1.5 text-rose-700">
                                      {check.violations
                                        .map((violation) => violation.message)
                                        .join("; ")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IssueLink({ domain, issueKey }: { domain: string; issueKey: string }) {
  return (
    <a
      href={`https://${domain}/view/${issueKey}`}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-blue-700 hover:underline"
    >
      {issueKey}
    </a>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
