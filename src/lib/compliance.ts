import { localDateKey, toDateKey } from "./date";
import { isFinishedStatus, normalizeFieldName } from "./report";
import { isEvaluatedSubtask } from "./subtask";
import type {
  ChildTask,
  ComplianceViolation,
  DueDateEdit,
  GroupTaskRow,
  MemberCompliance,
  SubtaskCheck,
} from "./types";

/**
 * Tên custom field theo Guideline đo Performance (Trục Tiến độ, mục 2). Project
 * chưa tạo field thì bỏ qua các check dời hạn, giống cách tool xử lý Actual End-date.
 */
const RESCHEDULE_FIELD = "Reschedule";
const RESCHEDULE_REASON_FIELD = "Reschedule Reason";
const RESCHEDULE_EVIDENCE_FIELD = "Reschedule Evidence";

/**
 * Số subtask tối đa mỗi lần đọc lịch sử sửa Due date. Mỗi subtask tốn ít nhất 1
 * request (Backlog giới hạn 600 request đọc/phút), nên chặn lại để không ăn hết quota.
 */
export const DUE_HISTORY_LIMIT = 300;

/** Dưới ngưỡng này thì kết quả tiến độ của kỳ cần PQA xác nhận lại (mục 10). */
export const COMPLIANCE_THRESHOLD = 0.9;

function findField(task: ChildTask, wanted: string) {
  const target = normalizeFieldName(wanted);
  return task.customFields.find((field) => normalizeFieldName(field.name) === target);
}

/** Giá trị custom field dạng chữ: list/checkbox trả {name} hoặc mảng {name}. */
function fieldText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ");
  if (typeof value === "object" && "name" in value) {
    return fieldText((value as { name: unknown }).name);
  }
  return "";
}

export function hasRescheduleField(task: ChildTask): boolean {
  return findField(task, RESCHEDULE_FIELD) !== undefined;
}

/**
 * Lần sửa Due date bị tính vi phạm: đổi từ một hạn đã có sang hạn khác, sau ngày
 * đặt hạn ban đầu. Backlog không có khái niệm sprint nên lấy ngày Due date được
 * điền lần đầu (hoặc ngày tạo ticket nếu điền ngay lúc tạo) thay cho "ngày bắt
 * đầu sprint"; sửa trong chính ngày đó coi như vẫn đang lên kế hoạch. Không lấy
 * Start Date làm mốc vì người dời hạn thường dời cả Start Date.
 */
function lateDueEdits(task: ChildTask, edits: DueDateEdit[]): DueDateEdit[] {
  const firstSet = edits.find((edit) => edit.from === null && edit.to !== null);
  const committedOn = localDateKey(new Date(firstSet?.changedAt ?? task.created));
  return edits.filter(
    (edit) =>
      edit.from !== null &&
      edit.from !== edit.to &&
      localDateKey(new Date(edit.changedAt)) > committedOn,
  );
}

/**
 * @param dueEdits null = chưa đọc lịch sử sửa Due date, bỏ qua check DUE_EDITED.
 */
export function checkSubtask(
  task: ChildTask,
  groupTaskKey: string,
  actualEndFieldName: string,
  dueEdits: DueDateEdit[] | null,
): SubtaskCheck {
  const violations: ComplianceViolation[] = [];
  const actualEndField = findField(task, actualEndFieldName);
  const actualEndDate = toDateKey(actualEndField?.value);

  if (task.assigneeId === null) {
    violations.push({ code: "NO_ASSIGNEE", message: "Chưa gán người phụ trách" });
  }
  if (!task.dueDate) {
    violations.push({ code: "NO_DUE_DATE", message: "Chưa có Due Date" });
  }
  if (
    actualEndField &&
    !actualEndDate &&
    isFinishedStatus({ id: task.statusId, name: task.statusName })
  ) {
    violations.push({ code: "NO_ACTUAL_END", message: "Closed nhưng thiếu Actual End-date" });
  }
  if (actualEndDate && task.startDate && actualEndDate < task.startDate) {
    violations.push({
      code: "END_BEFORE_START",
      message: "Actual End-date sớm hơn Start Date",
    });
  }

  if (fieldText(findField(task, RESCHEDULE_FIELD)?.value)) {
    const reason = fieldText(findField(task, RESCHEDULE_REASON_FIELD)?.value);
    const evidence = fieldText(findField(task, RESCHEDULE_EVIDENCE_FIELD)?.value);
    if (!reason) {
      violations.push({
        code: "RESCHEDULE_NO_REASON",
        message: "Có Reschedule nhưng chưa chọn Reschedule Reason",
      });
    } else if (/^E\d/i.test(reason) && !evidence) {
      violations.push({
        code: "RESCHEDULE_NO_EVIDENCE",
        message: "Lý do nhóm E nhưng thiếu Reschedule Evidence",
      });
    }
  }

  const lateEdits = dueEdits ? lateDueEdits(task, dueEdits) : [];
  if (lateEdits.length) {
    const changes = lateEdits.map((edit) => `${edit.from} → ${edit.to ?? "trống"}`);
    violations.push({
      code: "DUE_EDITED",
      message: `Sửa Due Date sau khi đã đặt hạn: ${changes.join(", ")}`,
    });
  }

  return { task, groupTaskKey, actualEndDate, violations };
}

/**
 * Tỷ lệ tuân thủ dữ liệu theo người (mục 10): số subtask không có lỗi dữ liệu ÷
 * tổng số subtask được đánh giá của các G-Task đang hiển thị. Người kém nhất lên đầu.
 */
export type DateRange = { from: string; to: string };

/**
 * Subtask thuộc khoảng ngày đang xem: lấy Actual End-date, thiếu thì Due Date
 * rồi Start Date (giống cách màn chính xếp ticket vào ngày). G-Task kéo dài
 * nhiều tháng nên không thể lấy hết task con của G-Task giao với khoảng ngày.
 * Subtask chưa điền ngày nào thì không xếp được vào kỳ: còn mở thì vẫn giữ để
 * thấy mà sửa, đã Closed thì bỏ.
 */
function inRange(task: ChildTask, actualEndFieldName: string, range: DateRange): boolean {
  const actualEndDate = toDateKey(findField(task, actualEndFieldName)?.value);
  const date = actualEndDate ?? task.dueDate ?? task.startDate;
  if (!date) return !isFinishedStatus({ id: task.statusId, name: task.statusName });
  return date >= range.from && date <= range.to;
}

/** Subtask được đánh giá và nằm trong khoảng ngày, kèm key G-Task cha. */
function subtasksInRange(
  rows: GroupTaskRow[],
  actualEndFieldName: string,
  range: DateRange,
): { task: ChildTask; groupTaskKey: string }[] {
  return rows.flatMap((row) =>
    row.children
      .filter((task) => isEvaluatedSubtask(task) && inRange(task, actualEndFieldName, range))
      .map((task) => ({ task, groupTaskKey: row.issueKey })),
  );
}

export function buildMemberCompliance(
  rows: GroupTaskRow[],
  actualEndFieldName: string,
  range: DateRange,
  dueEdits: Record<number, DueDateEdit[]> | null,
): MemberCompliance[] {
  const byMember = new Map<number | null, MemberCompliance>();

  for (const { task, groupTaskKey } of subtasksInRange(rows, actualEndFieldName, range)) {
    const check = checkSubtask(
      task,
      groupTaskKey,
      actualEndFieldName,
      dueEdits ? (dueEdits[task.id] ?? null) : null,
    );

    let member = byMember.get(task.assigneeId);
    if (!member) {
      member = {
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        total: 0,
        compliant: 0,
        rate: 0,
        checks: [],
      };
      byMember.set(task.assigneeId, member);
    }
    member.total += 1;
    if (!check.violations.length) member.compliant += 1;
    member.checks.push(check);
  }

  return [...byMember.values()]
    .map((member) => ({ ...member, rate: member.compliant / member.total }))
    .sort(
      (a, b) => a.rate - b.rate || a.assigneeName.localeCompare(b.assigneeName, "vi"),
    );
}

/** Id các subtask được đánh giá trong khoảng ngày, để đọc lịch sử sửa Due date. */
export function evaluatedSubtaskIds(
  rows: GroupTaskRow[],
  actualEndFieldName: string,
  range: DateRange,
): number[] {
  return subtasksInRange(rows, actualEndFieldName, range).map(({ task }) => task.id);
}
