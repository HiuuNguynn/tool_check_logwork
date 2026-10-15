import { eachDay, isWeekend, toDateKey, weekdayOf } from "./date";
import type {
  AcmsDailyData,
  BacklogIssue,
  DailyRow,
  ChildTotal,
  DayStatus,
  FieldMapping,
  GroupTaskRow,
  IssueRow,
  LeaveType,
  MemberDayCell,
  MemberRow,
  RuleViolation,
  SourceMatchStatus,
} from "./types";

/** Nghỉ nguyên lương (nghỉ lễ / nghỉ phép) thì bỏ qua mọi rule đối chiếu giờ trong ngày. */
export function isPaidDayOff(leaveType: LeaveType): boolean {
  return leaveType === "paid_leave" || leaveType === "holiday";
}

/** "Re-estimate hours" / "re_estimate hours" / "Re Estimate Hours" -> "reestimatehours" */
function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-–—/.()]+/g, "");
}

function findCustomField(issue: BacklogIssue, wanted: string) {
  const target = normalizeFieldName(wanted);
  if (!target) return undefined;
  return issue.customFields?.find(
    (field) => normalizeFieldName(field.name) === target,
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** So sánh giờ với dung sai nhỏ để tránh sai số dấu phẩy động (7.5 vs 7.50). */
export function sameHours(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export function checkRules(row: Omit<IssueRow, "violations">): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const dates: [string, string | null][] = [
    ["Start Date", row.startDate],
    ["Due Date", row.dueDate],
  ];
  if (row.supportsActualEnd) dates.push(["Actual End-date", row.actualEndDate]);

  const missingDates = dates.filter(([, value]) => !value).map(([label]) => label);
  if (missingDates.length) {
    violations.push({
      code: "MISSING_DATE",
      message: `Chưa điền: ${missingDates.join(", ")}`,
    });
  } else if (new Set(dates.map(([, value]) => value)).size > 1) {
    violations.push({
      code: "DATE_MISMATCH",
      message: `${dates.map(([label]) => label).join(" / ")} phải bằng nhau`,
    });
  }

  // Actual Hours luôn bắt buộc có giá trị.
  if (row.actualHours === null) {
    violations.push({
      code: "MISSING_HOURS",
      message: "Chưa điền: Actual Hours",
    });
  } else if (row.supportsReEstimate) {
    // Estimate = Actual nghĩa là làm đúng dự tính, không cần re-estimate.
    // Chỉ khi phát sinh chênh lệch (Estimate ≠ Actual, hoặc chưa có Estimate)
    // mới bắt buộc Re-estimate phải cập nhật đúng bằng Actual.
    const estimateMatchesActual =
      row.estimatedHours !== null && sameHours(row.estimatedHours, row.actualHours);

    if (!estimateMatchesActual) {
      if (row.reEstimateHours === null) {
        violations.push({
          code: "MISSING_HOURS",
          message: "Chưa điền: Re-estimate Hours (Estimate khác Actual)",
        });
      } else if (!sameHours(row.actualHours, row.reEstimateHours)) {
        violations.push({
          code: "HOURS_MISMATCH",
          message: "Actual Hours / Re-estimate Hours phải bằng nhau (Estimate khác Actual)",
        });
      }
    }
  }

  return violations;
}

export function toIssueRow(
  issue: BacklogIssue,
  mapping: FieldMapping,
): IssueRow {
  const reEstimateField = findCustomField(issue, mapping.reEstimateHours);
  const actualEndField = findCustomField(issue, mapping.actualEndDate);

  const startDate = toDateKey(issue.startDate);
  const dueDate = toDateKey(issue.dueDate);
  const actualEndDate = toDateKey(actualEndField?.value);

  const base: Omit<IssueRow, "violations"> = {
    id: issue.id,
    issueKey: issue.issueKey,
    summary: issue.summary,
    projectId: issue.projectId,
    statusName: issue.status?.name ?? "",
    issueTypeName: issue.issueType?.name ?? "",
    assigneeName: issue.assignee?.name ?? "(chưa gán)",
    assigneeId: issue.assignee?.id ?? null,
    startDate,
    dueDate,
    actualEndDate,
    estimatedHours: toNumber(issue.estimatedHours),
    actualHours: toNumber(issue.actualHours),
    reEstimateHours: toNumber(reEstimateField?.value),
    supportsReEstimate: reEstimateField !== undefined,
    supportsActualEnd: actualEndField !== undefined,
    // Ưu tiên ngày kết thúc thực tế; thiếu thì lùi về due date rồi start date.
    workDate: actualEndDate ?? dueDate ?? startDate,
  };

  return { ...base, violations: checkRules(base) };
}

export function inRange(
  dateKey: string | null,
  from: string,
  to: string,
): boolean {
  return !!dateKey && dateKey >= from && dateKey <= to;
}

export type BuildDailyOptions = {
  from: string;
  to: string;
  targetHours: number;
  includeEmptyDays: boolean;
  includeWeekends: boolean;
  /** null = chưa cấu hình ACMS token, không đối chiếu 3 nguồn. */
  acmsData: AcmsDailyData | null;
};

export function buildDailyRows(
  rows: IssueRow[],
  options: BuildDailyOptions,
): DailyRow[] {
  const grouped = new Map<string, IssueRow[]>();
  for (const row of rows) {
    if (!row.workDate) continue;
    const bucket = grouped.get(row.workDate);
    if (bucket) bucket.push(row);
    else grouped.set(row.workDate, [row]);
  }

  const dates = options.includeEmptyDays
    ? eachDay(options.from, options.to)
    : [...grouped.keys()].sort();

  return dates
    .filter((date) => options.includeWeekends || !isWeekend(date))
    .map((date) => {
      const dayRows = grouped.get(date) ?? [];
      const totalActual = sum(dayRows.map((row) => row.actualHours));
      const totalEstimate = sum(dayRows.map((row) => row.estimatedHours));
      const attendanceDay = options.acmsData?.attendance[date];
      const attendanceHours = options.acmsData
        ? round2(attendanceDay?.hours ?? 0)
        : null;
      const projectToolHours = options.acmsData
        ? round2(options.acmsData.projectTool[date] ?? 0)
        : null;
      const projectToolRows = options.acmsData?.projectToolEntries[date] ?? [];
      const leaveType = attendanceDay?.leaveType ?? null;
      const isRemote = attendanceDay?.isRemote ?? false;

      return {
        date,
        weekday: weekdayOf(date),
        isWeekend: isWeekend(date),
        rows: dayRows,
        totalActual,
        totalEstimate,
        diff: round2(totalActual - options.targetHours),
        status: dayStatus(
          totalActual,
          options.targetHours,
          dayRows.length,
          isWeekend(date),
          leaveType,
        ),
        attendanceHours,
        projectToolHours,
        projectToolRows,
        sourceMatch: sourceMatchStatus(
          totalActual,
          attendanceHours,
          projectToolHours,
          leaveType,
        ),
        leaveType,
        isRemote,
      };
    });
}

function sourceMatchStatus(
  backlogHours: number,
  attendanceHours: number | null,
  projectToolHours: number | null,
  leaveType: LeaveType,
): SourceMatchStatus {
  if (isPaidDayOff(leaveType)) return "leave";
  if (attendanceHours === null || projectToolHours === null) return "unavailable";
  const match =
    sameHours(backlogHours, attendanceHours) &&
    sameHours(backlogHours, projectToolHours);
  return match ? "match" : "mismatch";
}

function dayStatus(
  totalActual: number,
  targetHours: number,
  ticketCount: number,
  weekend: boolean,
  leaveType: LeaveType,
): DayStatus {
  if (isPaidDayOff(leaveType)) return "leave";
  // Ngày làm việc chưa log giờ nào vẫn là thiếu giờ; chỉ T7/CN mới được bỏ qua.
  if (ticketCount === 0) return weekend ? "empty" : "under";
  if (sameHours(totalActual, targetHours)) return "ok";
  return totalActual < targetHours ? "under" : "over";
}

export function sum(values: (number | null)[]): number {
  return round2(values.reduce<number>((acc, value) => acc + (value ?? 0), 0));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatHours(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Ma trận thành viên × ngày cho màn PM: chỉ dựa dữ liệu Backlog (rule ngày/giờ
 * từ `checkRules()`), không có rule 8h/ngày và không đối chiếu ACMS — token cá
 * nhân chỉ xem được chấm công của chính chủ nên không thể áp dụng cho cả team.
 * Cuối tuần không có ticket thì coi là "weekend", không tính là thiếu log.
 */
export function buildMemberMatrix(
  members: { id: number; name: string }[],
  rows: IssueRow[],
  range: { from: string; to: string },
): MemberRow[] {
  const dates = eachDay(range.from, range.to);
  const byMember = new Map<number, Map<string, IssueRow[]>>();

  for (const row of rows) {
    const workDate = row.workDate;
    if (row.assigneeId === null || !workDate || !inRange(workDate, range.from, range.to)) {
      continue;
    }
    let byDate = byMember.get(row.assigneeId);
    if (!byDate) {
      byDate = new Map();
      byMember.set(row.assigneeId, byDate);
    }
    const bucket = byDate.get(workDate);
    if (bucket) bucket.push(row);
    else byDate.set(workDate, [row]);
  }

  return members.map((member) => {
    const byDate = byMember.get(member.id);
    let missingDays = 0;
    let violationDays = 0;

    const cells: MemberDayCell[] = dates.map((date) => {
      const dayRows = byDate?.get(date) ?? [];
      const weekend = isWeekend(date);
      const totalActual = sum(dayRows.map((row) => row.actualHours));
      const violations = dayRows.flatMap((row) => row.violations);

      let status: MemberDayCell["status"];
      if (dayRows.length === 0) {
        status = weekend ? "weekend" : "missing";
        if (status === "missing") missingDays += 1;
      } else if (violations.length > 0) {
        status = "violation";
        violationDays += 1;
      } else {
        status = "ok";
      }

      return {
        date,
        isWeekend: weekend,
        ticketCount: dayRows.length,
        totalActual,
        violations,
        status,
      };
    });

    return {
      userId: member.id,
      userName: member.name,
      cells,
      totalActual: sum(cells.map((cell) => cell.totalActual)),
      missingDays,
      violationDays,
    };
  });
}

/** Status "Closed" mặc định của Backlog, id cố định ở mọi project. */
const CLOSED_STATUS_ID = 4;

/**
 * Ticket đã kết thúc: Closed mặc định, hoặc status tự tạo tên "Cancel" /
 * "Cancelled" — status tự tạo có id khác nhau theo từng project nên dò theo tên.
 */
export function isFinishedStatus(status: { id: number; name: string } | undefined): boolean {
  if (!status) return false;
  return status.id === CLOSED_STATUS_ID || /^cancel/i.test(status.name.trim());
}

/**
 * Dòng G-Task cho màn PM. Actual Hours của G-Task phải bằng tổng Actual Hours
 * của các task con; G-Task chưa kết thúc mà Due Date <= hôm nay (hoặc chưa
 * điền) thì báo đỏ để PM vào check lại. G-Task đã Closed/Cancel thì không cần
 * check Due Date.
 */
export function toGroupTaskRow(
  issue: BacklogIssue,
  childTotal: ChildTotal | undefined,
  today: string,
): GroupTaskRow {
  const actualHours = toNumber(issue.actualHours);
  const childActualHours = childTotal?.actualHours ?? 0;
  const dueDate = toDateKey(issue.dueDate);

  return {
    id: issue.id,
    issueKey: issue.issueKey,
    summary: issue.summary,
    statusName: issue.status?.name ?? "",
    assigneeName: issue.assignee?.name ?? "(chưa gán)",
    startDate: toDateKey(issue.startDate),
    dueDate,
    estimatedHours: toNumber(issue.estimatedHours),
    actualHours,
    childCount: childTotal?.count ?? 0,
    childActualHours,
    // G-Task chưa điền Actual và không có giờ con nào thì coi như đã khớp (0 = 0).
    actualMismatch: !sameHours(actualHours ?? 0, childActualHours),
    dueAlert: !isFinishedStatus(issue.status) && (dueDate === null || dueDate <= today),
  };
}
