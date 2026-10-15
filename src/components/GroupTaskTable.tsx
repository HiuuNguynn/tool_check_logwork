"use client";

import { useState } from "react";

import { formatHours } from "@/lib/report";
import type { GroupTaskRow } from "@/lib/types";

type Props = {
  rows: GroupTaskRow[];
  domain: string;
  /** Ghi tổng Actual Hours task con vào G-Task; throw nếu Backlog báo lỗi. */
  onUpdate: (issueId: number) => Promise<void>;
};

const PAGE_SIZES = [20, 50, 100] as const;

export function GroupTaskTable({ rows, domain, onUpdate }: Props) {
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  // Kẹp lại thay vì reset về trang 1 khi rows đổi, để bấm "Cập nhật" ở trang 2
  // không bị nhảy về trang đầu; chỉ khi danh sách ngắn đi mới lùi trang.
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!rows.length) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Không có G-Task nào trong project và khoảng ngày đã chọn.
      </div>
    );
  }

  async function handleUpdate(issueId: number) {
    setUpdating((current) => new Set(current).add(issueId));
    setErrors((current) => {
      const next = { ...current };
      delete next[issueId];
      return next;
    });
    try {
      await onUpdate(issueId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Cập nhật thất bại";
      setErrors((current) => ({ ...current, [issueId]: message }));
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        next.delete(issueId);
        return next;
      });
    }
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-5xl border-collapse text-sm">
          <thead className="sticky-head bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th className="w-32">Key</Th>
              <Th className="min-w-56">Summary</Th>
              <Th className="w-28">Status</Th>
              <Th className="w-40">Người phụ trách</Th>
              <Th className="w-28">Start Date</Th>
              <Th className="w-28">Due Date</Th>
              <Th className="w-24 text-right">Estimate</Th>
              <Th className="w-24 text-right">Actual</Th>
              <Th className="whitespace-nowrap text-right">Tổng Actual task con</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row) => {
              const isUpdating = updating.has(row.id);
              return (
                <tr key={row.id} className={row.dueAlert ? "bg-rose-50/40" : undefined}>
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
                  <Td className="max-w-sm">
                    <span className="line-clamp-2 text-slate-700" title={row.summary}>
                      {row.summary}
                    </span>
                  </Td>
                  <Td className="text-slate-600">{row.statusName}</Td>
                  <Td className="text-slate-600">{row.assigneeName}</Td>
                  <Td>{row.startDate ?? "—"}</Td>
                  <Td
                    className={row.dueAlert ? "bg-rose-200/70 font-semibold text-rose-900" : ""}
                  >
                    <span
                      title={
                        row.dueAlert
                          ? "Due Date <= hôm nay (hoặc chưa điền) — cần vào check lại"
                          : undefined
                      }
                    >
                      {row.dueDate ?? "Chưa điền"}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatHours(row.estimatedHours)}</Td>
                  <Td
                    className={`text-right tabular-nums ${
                      row.actualMismatch ? "bg-amber-100/80 font-medium text-amber-900" : ""
                    }`}
                  >
                    {formatHours(row.actualHours)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    <div className="font-medium text-slate-900">
                      {formatHours(row.childActualHours)}
                    </div>
                    <div className="text-xs text-slate-400">{row.childCount} task con</div>
                  </Td>
                  <Td>
                    {row.actualMismatch ? (
                      <button
                        type="button"
                        onClick={() => handleUpdate(row.id)}
                        disabled={isUpdating}
                        title={`Ghi ${formatHours(row.childActualHours)}h vào Actual Hours của G-Task`}
                        className="h-8 w-full whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {isUpdating ? "Updating…" : "Update"}
                      </button>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Đã khớp
                      </span>
                    )}
                    {errors[row.id] && (
                      <p className="mt-1 text-xs text-rose-700">{errors[row.id]}</p>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        total={rows.length}
        page={currentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}

function Pagination({
  total,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
      <label className="flex items-center gap-1.5">
        Hiển thị
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-7 rounded-md border border-slate-300 bg-white px-1.5 text-xs"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        dòng / trang
      </label>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {first}–{last} / {total}
        </span>
        <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹ Trước
        </PageButton>
        <span className="tabular-nums">
          Trang {page} / {pageCount}
        </span>
        <PageButton disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Sau ›
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 rounded-md border border-slate-300 bg-white px-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
