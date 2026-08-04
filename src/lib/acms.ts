import "server-only";

import type { AttendanceDay, LeaveType } from "./types";

const BASE_URL = "https://me-presentation.amela.vn/api";
const REQUEST_TIMEOUT_MS = 20_000;

export class AcmsError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AcmsError";
    this.status = status;
  }
}

export type AcmsCredentials = { token: string; userId: number };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function credentialsFromToken(token: string): AcmsCredentials {
  const payload = decodeJwtPayload(token);
  const userId = Number(payload?.user_id);
  if (!userId) {
    throw new AcmsError("ACMS token không hợp lệ (không đọc được user_id).", 401);
  }
  const exp = Number(payload?.exp);
  if (exp && exp * 1000 < Date.now()) {
    throw new AcmsError("ACMS token đã hết hạn. Vào Cài đặt để cập nhật.", 401);
  }
  return { token, userId };
}

async function acmsFetch<T>(path: string, creds: AcmsCredentials): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${creds.token}`,
        origin: "https://me.amela.vn",
        referer: "https://me.amela.vn/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AcmsError("Không kết nối được tới hệ thống ACMS.", 502);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AcmsError("ACMS token không hợp lệ hoặc đã hết hạn.", response.status);
  }
  if (!response.ok) {
    throw new AcmsError(`ACMS trả về lỗi ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

type TimesheetEntry = {
  work_time: number | null;
  createdAt: string | null;
  checkin: string | null;
  checkout: string | null;
  paid_leave: string | null;
  unpaid_leave: string | null;
  remote: number | boolean | null;
  request_type: number | null;
};

type TimesheetResponse = {
  data?: { time_sheet?: TimesheetEntry[] };
};

function hasValue(value: string | null): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * `paid_leave` / `unpaid_leave` có giá trị → nghỉ phép / nghỉ không lương cá nhân.
 *
 * `request_type === 3` nghĩa là "cả ngày được duyệt nghỉ" (theo dữ liệu thật đã
 * đối chiếu: ngày nghỉ phép và ngày nghỉ lễ đều có request_type=3 + checkin/
 * checkout null; khác nhau duy nhất ở việc có `paid_leave` đi kèm hay không).
 * Nên nếu request_type=3 mà KHÔNG có paid_leave/unpaid_leave và không phải
 * remote (field `remote`) thì suy ra là nghỉ lễ — không ai xin nghỉ cá nhân cả.
 */
function detectLeaveType(entry: TimesheetEntry): LeaveType {
  if (hasValue(entry.paid_leave)) return "paid_leave";
  if (hasValue(entry.unpaid_leave)) return "unpaid_leave";
  if (entry.request_type === 3 && !entry.checkin && !entry.checkout && !entry.remote) {
    return "holiday";
  }
  return null;
}

/** monthYear dạng "MM/YYYY". Trả về giờ chấm công + loại nghỉ + remote gộp theo ngày. */
export async function fetchTimesheetMonth(
  creds: AcmsCredentials,
  monthYear: string,
): Promise<Map<string, AttendanceDay>> {
  const json = await acmsFetch<TimesheetResponse>(
    `/time-sheet/user/${creds.userId}?userId=${creds.userId}` +
      `&category_id[]=1&category_id[]=2&date=${encodeURIComponent(monthYear)}`,
    creds,
  );

  const byDate = new Map<string, AttendanceDay>();
  for (const entry of json.data?.time_sheet ?? []) {
    const date = (entry.createdAt ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const existing = byDate.get(date);
    const hours = (existing?.hours ?? 0) + (entry.work_time ?? 0);
    const leaveType = existing?.leaveType ?? detectLeaveType(entry);
    const isRemote = existing?.isRemote || Boolean(entry.remote);
    byDate.set(date, { hours, leaveType, isRemote });
  }
  return byDate;
}

type DailyReportEntry = { actual_time: number | null };
type DailyReportDay = { work_date: string; reports_in_day?: DailyReportEntry[] };
type DailyReportsResponse = { data?: DailyReportDay[] };

/** monthInYear dạng "YYYY-MM". Trả về giờ log qua tool gộp theo ngày (yyyy-MM-dd). */
export async function fetchDailyReportsMonth(
  creds: AcmsCredentials,
  monthInYear: string,
): Promise<Map<string, number>> {
  const json = await acmsFetch<DailyReportsResponse>(
    `/daily-reports-calendar?month_in_year=${encodeURIComponent(monthInYear)}`,
    creds,
  );

  const byDate = new Map<string, number>();
  for (const day of json.data ?? []) {
    const hours = (day.reports_in_day ?? []).reduce(
      (sum, report) => sum + (report.actual_time ?? 0),
      0,
    );
    byDate.set(day.work_date, hours);
  }
  return byDate;
}
