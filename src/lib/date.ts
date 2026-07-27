/** Backlog trả ngày dạng ISO UTC ("2026-04-01T00:00:00Z"). Chỉ lấy phần yyyy-MM-dd. */
export function toDateKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function shiftDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Chủ nhật ... 6 = Thứ bảy */
export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function isWeekend(dateKey: string): boolean {
  const day = weekdayOf(dateKey);
  return day === 0 || day === 6;
}

export function weekdayLabel(dateKey: string): string {
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][weekdayOf(dateKey)];
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  // Chặn vòng lặp vô hạn nếu khoảng ngày bị nhập ngược hoặc quá lớn.
  for (let guard = 0; cursor <= to && guard < 1000; guard += 1) {
    days.push(cursor);
    cursor = shiftDays(cursor, 1);
  }
  return days;
}

export function todayKey(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function firstDayOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function lastDayOfMonth(dateKey: string): string {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Danh sách các tháng ("yyyy-MM") mà khoảng [from, to] đi qua. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));

  // Chặn vòng lặp vô hạn nếu khoảng ngày bị nhập ngược hoặc quá lớn.
  for (let guard = 0; guard < 60; guard += 1) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (year > endYear || (year === endYear && month >= endMonth)) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
