"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MultiSelect, type Option } from "./MultiSelect";
import { PmMatrix, type SelectedCell } from "./PmMatrix";
import { firstDayOfMonth, lastDayOfMonth, shiftDays, todayKey } from "@/lib/date";
import { buildMemberMatrix, formatHours, toIssueRow } from "@/lib/report";
import {
  authHeaders,
  DEFAULT_SETTINGS,
  loadSettings,
  type Settings,
} from "@/lib/settings";
import type { BacklogIssue, IssueRow, IssuesResponse, MemberRow } from "@/lib/types";

type Me = { id: number; name: string; domain: string };
type Member = { id: number; name: string };
type Range = { from: string; to: string };

async function getJson<T>(url: string, settings: Settings): Promise<T> {
  const response = await fetch(url, { headers: authHeaders(settings) });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `Lỗi ${response.status}`);
  return body as T;
}

function currentMonthRange(): Range {
  const today = todayKey();
  return { from: firstDayOfMonth(today), to: lastDayOfMonth(today) };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseIdList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function rangeFromSearchParams(params: URLSearchParams): Range {
  const fallback = currentMonthRange();
  const from = params.get("from");
  const to = params.get("to");
  return {
    from: from && DATE_PATTERN.test(from) ? from : fallback.from,
    to: to && DATE_PATTERN.test(to) ? to : fallback.to,
  };
}

export function PmView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<Option[]>([]);
  const [projectIds, setProjectIds] = useState<number[]>(() =>
    parseIdList(searchParams.get("projectIds")),
  );
  const [range, setRange] = useState<Range>(() => rangeFromSearchParams(searchParams));

  const [members, setMembers] = useState<Member[]>([]);
  const [issues, setIssues] = useState<BacklogIssue[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  // F5 phải khôi phục lại đúng lựa chọn trước đó rồi tự chạy lại, chứ không
  // chỉ khôi phục input mà bỏ trống bảng.
  const autoRunOnce = useRef(parseIdList(searchParams.get("projectIds")).length > 0);

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  // Đồng bộ project + khoảng ngày lên URL để F5 không mất lựa chọn.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("projectIds", projectIds.join(","));
    params.set("from", range.from);
    params.set("to", range.to);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [projectIds, range, pathname, router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      try {
        const [profile, projectList] = await Promise.all([
          getJson<Me>("/api/backlog/me", settings),
          getJson<{ id: number; projectKey: string; name: string }[]>(
            "/api/backlog/projects",
            settings,
          ),
        ]);
        if (cancelled) return;
        setMe(profile);
        setProjects(
          projectList.map((project) => ({
            value: project.id,
            label: `${project.projectKey} — ${project.name}`,
            hint: project.projectKey,
          })),
        );
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Lỗi kết nối");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, settings]);

  const runReport = useCallback(async () => {
    if (!projectIds.length) {
      setError("Chọn ít nhất 1 project để xem danh sách thành viên.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const projectKey = projectIds.join(",");
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        projectIds: projectKey,
        assigneeIds: "",
        statusIds: "",
      });
      const [memberList, issuesResult] = await Promise.all([
        getJson<Member[]>(`/api/backlog/users?projectIds=${projectKey}`, settings),
        getJson<IssuesResponse>(`/api/backlog/issues?${params}`, settings),
      ]);
      setMembers(memberList);
      setIssues(issuesResult.issues);
      setTruncated(issuesResult.truncated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lỗi khi tải dữ liệu");
      setIssues(null);
    } finally {
      setLoading(false);
    }
  }, [projectIds, range, settings]);

  useEffect(() => {
    if (!me || !autoRunOnce.current) return;
    autoRunOnce.current = false;
    runReport();
  }, [me, runReport]);

  const rows = useMemo<IssueRow[]>(() => {
    if (!issues) return [];
    return issues.map((issue) => toIssueRow(issue, settings.mapping));
  }, [issues, settings.mapping]);

  const memberRows = useMemo<MemberRow[]>(() => {
    if (!issues) return [];
    return buildMemberMatrix(members, rows, range).sort(
      (a, b) =>
        b.violationDays + b.missingDays - (a.violationDays + a.missingDays) ||
        a.userName.localeCompare(b.userName, "vi"),
    );
  }, [members, rows, range, issues]);

  const selectedRows = useMemo(() => {
    if (!selected) return [];
    return rows
      .filter(
        (row) => row.assigneeId === selected.userId && row.workDate === selected.date,
      )
      .sort((a, b) => a.issueKey.localeCompare(b.issueKey));
  }, [rows, selected]);

  const selectedMemberName = useMemo(() => {
    if (!selected) return "";
    return memberRows.find((row) => row.userId === selected.userId)?.userName ?? "";
  }, [memberRows, selected]);

  const domain = me?.domain ?? settings.domain;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kiểm tra log việc theo thành viên (PM)</h1>
          <p className="text-sm text-slate-500">
            {me
              ? `${me.name} · ${me.domain}`
              : "Chưa kết nối — vào Cài đặt ở trang chính để nhập API key."}
          </p>
        </div>
        <Link
          href="/"
          className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Quay lại báo cáo
        </Link>
      </header>

      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MultiSelect
            label="Project"
            options={projects}
            selected={projectIds}
            onChange={setProjectIds}
            emptyLabel="Chọn project…"
          />
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">Từ ngày</span>
            <input
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange((current) => ({ ...current, from: event.target.value }))
              }
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">Đến ngày</span>
            <input
              type="date"
              value={range.to}
              onChange={(event) =>
                setRange((current) => ({ ...current, to: event.target.value }))
              }
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={runReport}
              disabled={loading}
              className="h-9 w-full rounded-md bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Đang tải…" : "Kiểm tra"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Nhanh:</span>
          <QuickButton onClick={() => setRange(currentMonthRange())}>Tháng này</QuickButton>
          <QuickButton
            onClick={() => {
              const anchor = shiftDays(firstDayOfMonth(todayKey()), -1);
              setRange({ from: firstDayOfMonth(anchor), to: lastDayOfMonth(anchor) });
            }}
          >
            Tháng trước
          </QuickButton>
          <label className="flex items-center gap-1.5 text-slate-500">
            Chọn tháng khác:
            <input
              type="month"
              value={range.from.slice(0, 7)}
              onChange={(event) => {
                if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
                const anchor = `${event.target.value}-01`;
                setRange({ from: firstDayOfMonth(anchor), to: lastDayOfMonth(anchor) });
              }}
              className="h-7 rounded-full border border-slate-200 px-2 text-xs text-slate-600"
            />
          </label>
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {truncated && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Kết quả đã bị cắt bớt vì quá nhiều ticket. Hãy thu hẹp khoảng ngày hoặc chọn ít
          project hơn.
        </p>
      )}

      {issues === null ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Chọn project và khoảng ngày rồi bấm <strong>Kiểm tra</strong> để xem toàn bộ
          thành viên.
        </div>
      ) : (
        <>
          <SummaryStrip memberRows={memberRows} />
          <Legend />
          <PmMatrix rows={memberRows} selected={selected} onSelectCell={setSelected} />
          {selected && (
            <SelectedDetail
              memberName={selectedMemberName}
              date={selected.date}
              rows={selectedRows}
              domain={domain}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
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

function SummaryStrip({ memberRows }: { memberRows: MemberRow[] }) {
  const totalMembers = memberRows.length;
  const membersWithMissing = memberRows.filter((row) => row.missingDays > 0).length;
  const membersWithViolation = memberRows.filter((row) => row.violationDays > 0).length;
  const fullyClean = memberRows.filter(
    (row) => row.missingDays === 0 && row.violationDays === 0,
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Thành viên" value={totalMembers} />
      <StatCard label="Log đầy đủ, đúng rule" value={fullyClean} tone="emerald" />
      <StatCard label="Có ngày thiếu log" value={membersWithMissing} tone="amber" />
      <StatCard label="Có ngày sai rule" value={membersWithViolation} tone="rose" />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
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

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
      <LegendDot className="bg-emerald-100" label="Đã log, đúng rule" />
      <LegendDot className="bg-rose-100" label="Có log nhưng sai rule (ngày/giờ không khớp)" />
      <LegendDot className="bg-amber-100" label="Ngày làm việc chưa log ticket nào" />
      <LegendDot className="bg-slate-50" label="Cuối tuần (không tính)" />
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded ${className}`} />
      {label}
    </span>
  );
}

function SelectedDetail({
  memberName,
  date,
  rows,
  domain,
  onClose,
}: {
  memberName: string;
  date: string;
  rows: IssueRow[];
  domain: string;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {memberName} · {date}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:underline"
        >
          Đóng
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Không có ticket nào được log trong ngày này.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="w-32 py-1.5 pr-3">
                  <a
                    href={`https://${domain}/view/${row.issueKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {row.issueKey}
                  </a>
                </td>
                <td className="py-1.5 pr-3 text-slate-600">{row.summary}</td>
                <td className="w-24 py-1.5 text-right tabular-nums text-slate-700">
                  {formatHours(row.actualHours)}h
                </td>
                <td className="w-56 py-1.5 pl-3 text-rose-700">
                  {row.violations.map((violation) => violation.message).join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
