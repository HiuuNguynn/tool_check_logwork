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

export type BacklogIssueType = {
  id: number;
  projectId: number;
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
  /** Có giá trị khi ticket là task con (VD: task con của một G-Task). */
  parentIssueId?: number | null;
  status: { id: number; name: string };
  issueType: { id: number; name: string };
  assignee: BacklogUser | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  /** Thời điểm tạo ticket, ISO UTC. */
  created: string;
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

export type DayStatus = "ok" | "under" | "over" | "empty" | "leave";

/** null = chưa cấu hình ACMS token nên không có dữ liệu để đối chiếu. */
export type SourceMatchStatus = "match" | "mismatch" | "unavailable" | "leave";

/**
 * Loại nghỉ nhận diện được từ time-sheet ACMS:
 * - `paid_leave` có giá trị → nghỉ phép cá nhân (kèm request_type = 3).
 * - `unpaid_leave` có giá trị → nghỉ không lương.
 * - `request_type === 3` (cả ngày được duyệt nghỉ) nhưng KHÔNG có paid_leave/
 *   unpaid_leave và không phải remote → nghỉ lễ (không ai xin nghỉ cá nhân,
 *   suy ra cả công ty nghỉ). So sánh thực tế: ngày nghỉ phép 07-03 và ngày nghỉ
 *   lễ 07-20 đều có request_type=3 + checkin/checkout null, chỉ khác nhau ở
 *   việc có paid_leave hay không.
 * null = ngày làm việc bình thường (kể cả remote).
 */
export type LeaveType = "paid_leave" | "unpaid_leave" | "holiday" | null;

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
  /** Danh sách từng dòng đã log qua tool ACMS trong ngày (tách riêng khỏi Backlog). */
  projectToolRows: ProjectToolEntry[];
  /** Tổng giờ chấm công (time-sheet) trong ngày. */
  attendanceHours: number | null;
  /** Đối chiếu Backlog Actual / Time dự án / Chấm công có khớp nhau không. */
  sourceMatch: SourceMatchStatus;
  /** Nghỉ lễ / nghỉ phép / nghỉ không lương theo dữ liệu chấm công ACMS. */
  leaveType: LeaveType;
  /** Làm remote theo field `remote` trên time-sheet — vẫn phải check bình thường. */
  isRemote: boolean;
};

export type IssuesResponse = {
  issues: BacklogIssue[];
  truncated: boolean;
  fetched: number;
};

export type AttendanceDay = {
  hours: number;
  leaveType: LeaveType;
  isRemote: boolean;
};

/** Một dòng log việc qua tool ACMS (daily-reports-calendar), tách riêng khỏi Backlog. */
export type ProjectToolEntry = {
  title: string;
  actualTime: number;
  /** Issue key Backlog suy ra từ link_backlog, nếu có liên kết. */
  issueKey: string | null;
  linkBacklog: string | null;
  projectName: string | null;
};

/** Dữ liệu ACMS gom theo ngày (key: yyyy-MM-dd). */
export type AcmsDailyData = {
  attendance: Record<string, AttendanceDay>;
  projectTool: Record<string, number>;
  projectToolEntries: Record<string, ProjectToolEntry[]>;
};

/**
 * Trạng thái 1 ô (thành viên × ngày) trong màn PM — không có rule 8h/ngày và
 * không đối chiếu ACMS vì token cá nhân chỉ xem được chấm công của chính chủ.
 */
export type MemberDayStatus = "ok" | "violation" | "missing" | "weekend";

export type MemberDayCell = {
  date: string;
  isWeekend: boolean;
  ticketCount: number;
  totalActual: number;
  violations: RuleViolation[];
  status: MemberDayStatus;
};

export type MemberRow = {
  userId: number;
  userName: string;
  cells: MemberDayCell[];
  totalActual: number;
  /** Số ngày làm việc (không tính T7/CN) không có ticket nào được log. */
  missingDays: number;
  /** Số ngày có ticket nhưng sai rule ngày/giờ. */
  violationDays: number;
};

/** Task con của G-Task, chỉ giữ field cần hiển thị (bỏ description… cho nhẹ). */
export type ChildTask = {
  id: number;
  issueKey: string;
  summary: string;
  statusId: number;
  statusName: string;
  issueTypeName: string;
  assigneeId: number | null;
  assigneeName: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  /** Thời điểm tạo ticket, ISO UTC. */
  created: string;
  /** Giữ cả field rỗng: field có mặt nghĩa là project có cấu hình field đó. */
  customFields: { name: string; value: unknown }[];
};

/** Lỗi dữ liệu của 1 subtask theo trục Tiến độ của guideline (mục 2, 3, 4, 11). */
export type ComplianceCode =
  | "NO_ASSIGNEE"
  | "NO_DUE_DATE"
  | "NO_ACTUAL_END"
  | "END_BEFORE_START"
  | "RESCHEDULE_NO_REASON"
  | "RESCHEDULE_NO_EVIDENCE"
  | "DUE_EDITED";

export type ComplianceViolation = {
  code: ComplianceCode;
  message: string;
};

/** Một lần sửa Due date đọc từ changeLog của comment trên Backlog. */
export type DueDateEdit = {
  /** Thời điểm sửa, ISO UTC như Backlog trả về. */
  changedAt: string;
  from: string | null;
  to: string | null;
};

export type DueHistoryResponse = {
  /** key: id của subtask. Chỉ có các id đã đọc được lịch sử. */
  edits: Record<number, DueDateEdit[]>;
  /** Backlog báo vượt giới hạn request giữa chừng, các id chưa có trong `edits` chưa đọc. */
  rateLimited: boolean;
};

export type SubtaskCheck = {
  task: ChildTask;
  groupTaskKey: string;
  actualEndDate: string | null;
  violations: ComplianceViolation[];
};

/** Tỷ lệ tuân thủ dữ liệu của 1 người (guideline Tiến độ mục 10). */
export type MemberCompliance = {
  assigneeId: number | null;
  assigneeName: string;
  total: number;
  compliant: number;
  /** 0–1. */
  rate: number;
  checks: SubtaskCheck[];
};

export type ChildTotal = {
  /** Danh sách task con, để bung ra xem trong tab G-Task. */
  tasks: ChildTask[];
  /** Tổng Actual Hours của các task con, task con chưa điền tính là 0. */
  actualHours: number;
};

export type GroupTasksResponse = {
  issues: BacklogIssue[];
  /** key: id của G-Task. */
  childTotals: Record<number, ChildTotal>;
  truncated: boolean;
};

/** Một dòng trong tab G-Task của màn PM. */
export type GroupTaskRow = {
  id: number;
  issueKey: string;
  summary: string;
  statusName: string;
  assigneeName: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  /** Actual Hours đang lưu trên chính G-Task. */
  actualHours: number | null;
  children: ChildTask[];
  /** Tổng Actual Hours của các task con — giá trị nút "Cập nhật" sẽ ghi vào G-Task. */
  childActualHours: number;
  /** Actual Hours trên G-Task chưa bằng tổng task con. */
  actualMismatch: boolean;
  /** G-Task chưa Closed/Cancel mà Due Date <= hôm nay (hoặc chưa điền) — cần vào check để sửa. */
  dueAlert: boolean;
  /** Subtask BẮT BUỘC theo guideline mà G-Task chưa có, VD "[srs][BA]". */
  missingRequired: string[];
  /** Số subtask được đánh giá mà tiêu đề chưa theo quy ước `[mã][Role]`. */
  offConventionCount: number;
};
