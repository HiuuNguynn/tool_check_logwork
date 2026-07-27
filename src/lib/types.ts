export type BacklogUser = {
  id: number;
  userId: string | null;
  name: string;
  mailAddress?: string | null;
};

export type BacklogProject = {
  id: number;
  projectKey: string;
  name: string;
};

export type BacklogCustomField = {
  id: number;
  fieldTypeId: number;
  name: string;
  value: unknown;
};

export type BacklogIssue = {
  id: number;
  issueKey: string;
  summary: string;
  projectId: number;
  status: { id: number; name: string };
  issueType: { id: number; name: string };
  assignee: BacklogUser | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  customFields?: BacklogCustomField[];
};

/** Tên custom field có thể tuỳ biến theo project. */
export type FieldMapping = {
  reEstimateHours: string;
  actualEndDate: string;
};

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  reEstimateHours: "Re-estimate hours",
  actualEndDate: "Actual End-date",
};

export type RuleCode =
  | "MISSING_DATE"
  | "DATE_MISMATCH"
  | "MISSING_HOURS"
  | "HOURS_MISMATCH";

export type RuleViolation = {
  code: RuleCode;
  message: string;
};

export type IssueRow = {
  id: number;
  issueKey: string;
  summary: string;
  projectId: number;
  statusName: string;
  issueTypeName: string;
  assigneeName: string;
  assigneeId: number | null;
  startDate: string | null;
  dueDate: string | null;
  actualEndDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  reEstimateHours: number | null;
  /**
   * Custom field là cấu hình riêng của từng project. Nếu project không khai báo
   * field thì không thể coi là "chưa điền" — bỏ qua khi kiểm tra rule.
   */
  supportsReEstimate: boolean;
  supportsActualEnd: boolean;
  /** Ngày dùng để gom nhóm thống kê theo ngày. */
  workDate: string | null;
  violations: RuleViolation[];
};

export type DayStatus = "ok" | "under" | "over" | "empty";

/** null = chưa cấu hình ACMS token nên không có dữ liệu để đối chiếu. */
export type SourceMatchStatus = "match" | "mismatch" | "unavailable";

export type DailyRow = {
  date: string;
  weekday: number;
  isWeekend: boolean;
  rows: IssueRow[];
  totalActual: number;
  totalEstimate: number;
  diff: number;
  status: DayStatus;
  /** Tổng giờ báo cáo qua tool ACMS (daily-reports-calendar) trong ngày. */
  projectToolHours: number | null;
  /** Tổng giờ chấm công (time-sheet) trong ngày. */
  attendanceHours: number | null;
  /** Đối chiếu Backlog Actual / Time dự án / Chấm công có khớp nhau không. */
  sourceMatch: SourceMatchStatus;
};

export type IssuesResponse = {
  issues: BacklogIssue[];
  truncated: boolean;
  fetched: number;
};

/** Dữ liệu ACMS gom theo ngày (key: yyyy-MM-dd), giá trị: số giờ. */
export type AcmsDailyData = {
  attendance: Record<string, number>;
  projectTool: Record<string, number>;
};
