"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AttendanceCompareTable } from "./AttendanceCompareTable";
import { DailyTable } from "./DailyTable";
import {
  defaultFilters,
  FilterBar,
  filtersFromSearchParams,
  filtersToSearchParams,
  type Filters,
} from "./FilterBar";
import type { Option } from "./MultiSelect";
import { SettingsDialog } from "./SettingsDialog";
import { SummaryCards } from "./SummaryCards";
import { TicketTable } from "./TicketTable";
import { downloadCsv, toCsv } from "@/lib/csv";
import { weekdayLabel } from "@/lib/date";
import { buildDailyRows, formatHours, inRange, toIssueRow } from "@/lib/report";
import {
  authHeaders,
  DEFAULT_SETTINGS,
  hasAcmsToken,
  hasCredentials,
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/settings";
import type { AcmsDailyData, BacklogIssue, IssuesResponse } from "@/lib/types";

type Me = { id: number; name: string; domain: string };
type Tab = "daily" | "ticket" | "attendance";

async function getJson<T>(url: string, settings: Settings): Promise<T> {
  const response = await fetch(url, { headers: authHeaders(settings) });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `Lỗi ${response.status}`);
  return body as T;
}

export function ReportApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [filters, setFilters] = useState<Filters>(
    () => filtersFromSearchParams(searchParams) ?? defaultFilters(),
  );
  const [issues, setIssues] = useState<BacklogIssue[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [acmsData, setAcmsData] = useState<AcmsDailyData | null>(null);
  const [acmsError, setAcmsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("daily");

  // URL đã có bộ lọc từ trước (VD sau khi F5) → giữ nguyên lựa chọn người
  // thực hiện thay vì tự động chọn lại "chính mình".
  const assigneeInitialized = useRef(searchParams.has("assigneeIds"));
  const autoRunTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Đồng bộ mỗi lần đổi bộ lọc lên URL query params để F5 không mất lựa chọn.
  useEffect(() => {
    const params = filtersToSearchParams(filters);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [filters, pathname, router]);

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  // Nạp thông tin tài khoản + danh sách project mỗi khi credential đổi.
  // Không chặn khi thiếu key trong trình duyệt: server có thể đã cấu hình sẵn
  // BACKLOG_* trong .env cho bản self-host dùng chung một key.
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
        if (!assigneeInitialized.current) {
          assigneeInitialized.current = true;
          setFilters((current) => ({ ...current, assigneeIds: [profile.id] }));
        }
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Lỗi kết nối");
        if (!hasCredentials(settings)) setSettingsOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, settings]);

  const projectKey = filters.projectIds.join(",");

  useEffect(() => {
    if (!ready || !me) return;
    let cancelled = false;

    setUsersLoading(true);
    (async () => {
      try {
        const list = await getJson<{ id: number; name: string }[]>(
          `/api/backlog/users?projectIds=${projectKey}`,
          settings,
        );
        if (!cancelled) {
          setUsers(list.map((user) => ({ value: user.id, label: user.name })));
        }
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, settings, me, projectKey]);

  const runReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAcmsError(null);
    try {
      const params = new URLSearchParams({
        from: filters.from,
        to: filters.to,
        projectIds: filters.projectIds.join(","),
        assigneeIds: filters.assigneeIds.join(","),
        statusIds: filters.statusIds.join(","),
      });
      const result = await getJson<IssuesResponse>(
        `/api/backlog/issues?${params}`,
        settings,
      );
      setIssues(result.issues);
      setTruncated(result.truncated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lỗi khi tải ticket");
      setIssues(null);
      setLoading(false);
      return;
    }

    // ACMS là tuỳ chọn: lỗi ở đây không chặn phần thống kê Backlog. Luôn gọi
    // route (kể cả khi trình duyệt chưa lưu token) để server có cơ hội dùng
    // ACMS_TOKEN cấu hình sẵn cho bản self-host dùng chung một token.
    try {
      const acmsParams = new URLSearchParams({ from: filters.from, to: filters.to });
      const result = await getJson<AcmsDailyData>(
        `/api/acms/report?${acmsParams}`,
        settings,
      );
      setAcmsData(result);
    } catch (caught) {
      setAcmsData(null);
      const message =
        caught instanceof Error ? caught.message : "Lỗi khi tải dữ liệu ACMS";
      // Chưa ai cấu hình ACMS (trình duyệt lẫn server) thì im lặng, không doạ người dùng.
      const notConfigured = !hasAcmsToken(settings) && /Thiếu ACMS token/.test(message);
      if (!notConfigured) setAcmsError(message);
    }

    setLoading(false);
  }, [filters, settings]);

  // Mỗi lần đổi bộ lọc (kể cả lần khôi phục từ URL sau F5) tự chạy lại report
  // sau một nhịp ngắn, không bắt phải bấm nút "Thống kê" — nút vẫn giữ để
  // người dùng chủ động chạy lại ngay lập tức khi cần.
  useEffect(() => {
    if (!me) return;
    autoRunTimeout.current = setTimeout(() => {
      autoRunTimeout.current = null;
      runReport();
    }, 500);
    return () => {
      if (autoRunTimeout.current) clearTimeout(autoRunTimeout.current);
    };
  }, [filters, me, runReport]);

  function runReportNow() {
    if (autoRunTimeout.current) {
      clearTimeout(autoRunTimeout.current);
      autoRunTimeout.current = null;
    }
    runReport();
  }

  const rows = useMemo(() => {
    if (!issues) return [];
    return issues
      .map((issue) => toIssueRow(issue, settings.mapping))
      .filter((row) => inRange(row.workDate, filters.from, filters.to))
      .filter((row) => !filters.onlyViolations || row.violations.length > 0)
      .sort(
        (a, b) =>
          (a.workDate ?? "").localeCompare(b.workDate ?? "") ||
          a.issueKey.localeCompare(b.issueKey),
      );
  }, [issues, settings.mapping, filters.from, filters.to, filters.onlyViolations]);

  const dailyRows = useMemo(
    () =>
      buildDailyRows(rows, {
        from: filters.from,
        to: filters.to,
        targetHours: settings.targetHours,
        includeEmptyDays: filters.includeEmptyDays,
        includeWeekends: filters.includeWeekends,
        acmsData,
      }),
    [
      rows,
      filters.from,
      filters.to,
      filters.includeEmptyDays,
      filters.includeWeekends,
      settings.targetHours,
      acmsData,
    ],
  );

  function exportTickets() {
    const csv = toCsv(
      [
        "Key",
        "Summary",
        "Start Date",
        "Due Date",
        "Actual End-date",
        "Estimate Hours",
        "Actual Hours",
        "Re-estimate Hours",
        "Status",
        "Assignee",
        "Rule",
      ],
      rows.map((row) => [
        row.issueKey,
        row.summary,
        row.startDate,
        row.dueDate,
        row.supportsActualEnd ? row.actualEndDate : "n/a",
        row.estimatedHours,
        row.actualHours,
        row.supportsReEstimate ? row.reEstimateHours : "n/a",
        row.statusName,
        row.assigneeName,
        row.violations.map((violation) => violation.message).join(" | ") || "OK",
      ]),
    );
    downloadCsv(`logwork-tickets-${filters.from}_${filters.to}.csv`, csv);
  }

  function exportDaily() {
    const csv = toCsv(
      [
        "Ngày",
        "Thứ",
        "Số ticket",
        "Actual Hours (Backlog)",
        "Time dự án (ACMS)",
        "Chấm công (ACMS)",
        "Lệch",
        "Kết quả",
        "Đối chiếu 3 nguồn",
        "Danh sách key",
      ],
      dailyRows.map((day) => [
        day.date,
        weekdayLabel(day.date),
        day.rows.length,
        day.totalActual,
        day.projectToolHours,
        day.attendanceHours,
        day.diff,
        day.status,
        day.sourceMatch,
        day.rows.map((row) => row.issueKey).join(" "),
      ]),
    );
    downloadCsv(`logwork-daily-${filters.from}_${filters.to}.csv`, csv);
  }

  const domain = me?.domain ?? settings.domain;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Backlog Logwork Report</h1>
          <p className="text-sm text-slate-500">
            {me
              ? `${me.name} · ${me.domain}`
              : "Chưa kết nối — vào Cài đặt để nhập API key."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cài đặt
        </button>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        projects={projects}
        users={users}
        usersLoading={usersLoading}
        loading={loading}
        onSubmit={runReportNow}
      />

      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {truncated && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Kết quả đã bị cắt bớt vì quá nhiều ticket. Hãy thu hẹp khoảng ngày,
          chọn ít project hơn hoặc lọc theo người thực hiện.
        </p>
      )}

      {acmsError && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Không lấy được dữ liệu ACMS (chấm công / time dự án): {acmsError} —
          bảng theo ngày vẫn hiển thị dữ liệu Backlog bình thường.
        </p>
      )}

      {issues === null ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Chọn bộ lọc rồi bấm <strong>Thống kê</strong> để bắt đầu.
        </div>
      ) : (
        <>
          <SummaryCards
            rows={rows}
            dailyRows={dailyRows}
            targetHours={settings.targetHours}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-slate-200 p-1">
              <TabButton
                active={tab === "daily"}
                onClick={() => setTab("daily")}
              >
                Theo ngày ({dailyRows.length})
              </TabButton>
              <TabButton
                active={tab === "ticket"}
                onClick={() => setTab("ticket")}
              >
                Theo ticket ({rows.length})
              </TabButton>
              <TabButton
                active={tab === "attendance"}
                onClick={() => setTab("attendance")}
              >
                Đối chiếu chấm công
              </TabButton>
            </div>

            <button
              type="button"
              onClick={tab === "ticket" ? exportTickets : exportDaily}
              className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Xuất CSV
            </button>
          </div>

          {tab !== "attendance" && <Legend targetHours={settings.targetHours} />}

          {tab === "daily" && (
            <DailyTable
              days={dailyRows}
              domain={domain}
              targetHours={settings.targetHours}
            />
          )}
          {tab === "ticket" && <TicketTable rows={rows} domain={domain} />}
          {tab === "attendance" && <AttendanceCompareTable days={dailyRows} />}
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          saveSettings(next);
          setSettings(next);
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ targetHours }: { targetHours: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
      <LegendDot className="bg-emerald-200" label={`Đủ ${formatHours(targetHours)}h`} />
      <LegendDot className="bg-rose-200" label={`Thiếu giờ / sai rule / lệch 3 nguồn`} />
      <LegendDot className="bg-amber-200" label="Dư giờ" />
      <LegendDot className="bg-slate-200" label="Chưa log giờ" />
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
