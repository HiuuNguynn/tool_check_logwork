import "server-only";

import type {
  BacklogIssue,
  BacklogIssueType,
  BacklogProject,
  BacklogUser,
  ChildTotal,
  GroupTasksResponse,
  IssuesResponse,
} from "./types";
import { isFinishedStatus, round2 } from "./report";

export const PAGE_SIZE = 100;
export const MAX_PAGES = 25;
export const REQUEST_TIMEOUT_MS = 25_000;

export type Credentials = {
  domain: string;
  apiKey: string;
};

export class BacklogError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "BacklogError";
    this.status = status;
  }
}

/** "amelainc" | "https://amelainc.backlog.com/xxx" -> "amelainc.backlog.com" */
export function normalizeDomain(value: string): string {
  const raw = (value || "").trim().replace(/^https?:\/\//, "").split("/")[0];
  if (!raw) return "";
  if (raw.includes(".")) return raw;
  return `${raw}.backlog.com`;
}

export function credentialsFromRequest(request: Request): Credentials {
  const domain = normalizeDomain(
    request.headers.get("x-backlog-domain") || process.env.BACKLOG_DOMAIN || "",
  );
  const apiKey = (
    request.headers.get("x-backlog-api-key") ||
    process.env.BACKLOG_API_KEY ||
    ""
  ).trim();

  if (!domain || !apiKey) {
    throw new BacklogError(
      "Thiếu Backlog domain hoặc API key. Vào Cài đặt để nhập.",
      401,
    );
  }
  return { domain, apiKey };
}

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue | QueryValue[]>;

function buildUrl(creds: Credentials, path: string, query: Query = {}): string {
  const url = new URL(`https://${creds.domain}/api/v2${path}`);
  url.searchParams.set("apiKey", creds.apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined || item === "") continue;
      url.searchParams.append(key, String(item));
    }
  }
  return url.toString();
}

async function backlogFetch<T>(
  creds: Credentials,
  path: string,
  query: Query = {},
  init: { method?: string; body?: URLSearchParams } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(creds, path, query), {
      method: init.method ?? "GET",
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new BacklogError(
      `Không kết nối được tới ${creds.domain}. Kiểm tra domain và mạng.`,
      502,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let message = `Backlog trả về lỗi ${response.status}`;
    try {
      const parsed = JSON.parse(detail) as { errors?: { message?: string }[] };
      const first = parsed.errors?.[0]?.message;
      if (first) message = first;
    } catch {
      /* body không phải JSON, giữ message mặc định */
    }
    if (response.status === 401) message = "API key không hợp lệ.";
    if (response.status === 403) message = "API key không có quyền truy cập tài nguyên này.";
    throw new BacklogError(message, response.status);
  }

  return (await response.json()) as T;
}

export function fetchMyself(creds: Credentials) {
  return backlogFetch<BacklogUser>(creds, "/users/myself");
}

export function fetchProjects(creds: Credentials) {
  return backlogFetch<BacklogProject[]>(creds, "/projects");
}

export function fetchProjectUsers(creds: Credentials, projectId: number) {
  return backlogFetch<BacklogUser[]>(creds, `/projects/${projectId}/users`);
}

export function fetchSpaceUsers(creds: Credentials) {
  return backlogFetch<BacklogUser[]>(creds, "/users");
}

export function fetchIssue(creds: Credentials, issueIdOrKey: number | string) {
  return backlogFetch<BacklogIssue>(creds, `/issues/${issueIdOrKey}`);
}

function fetchIssueTypes(creds: Credentials, projectId: number) {
  return backlogFetch<BacklogIssueType[]>(creds, `/projects/${projectId}/issueTypes`);
}

/** Thao tác ghi duy nhất của app: chỉ đổi Actual Hours, không đụng field khác. */
export function updateActualHours(
  creds: Credentials,
  issueId: number,
  actualHours: number,
) {
  return backlogFetch<BacklogIssue>(
    creds,
    `/issues/${issueId}`,
    {},
    { method: "PATCH", body: new URLSearchParams({ actualHours: String(actualHours) }) },
  );
}

async function fetchIssuePages(
  creds: Credentials,
  query: Query,
): Promise<{ issues: BacklogIssue[]; truncated: boolean }> {
  const issues: BacklogIssue[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await backlogFetch<BacklogIssue[]>(creds, "/issues", {
      ...query,
      count: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort: "dueDate",
      order: "asc",
    });
    issues.push(...batch);
    if (batch.length < PAGE_SIZE) return { issues, truncated: false };
  }

  return { issues, truncated: true };
}

export type IssueQuery = {
  projectIds: number[];
  assigneeIds: number[];
  statusIds: number[];
  /** yyyy-MM-dd, đã cộng thêm padding trước khi truyền vào. */
  since: string | null;
  until: string | null;
};

/** "GTask" / "G-Task" / "g task" đều coi là ticket gộp, không tính vào logwork. */
function isGroupTaskType(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().replace(/[\s_-]+/g, "") === "gtask";
}

export function isGroupTask(issue: BacklogIssue): boolean {
  return isGroupTaskType(issue.issueType?.name);
}

/**
 * Backlog không lọc được theo "Actual End-date" (custom field), và một ticket sai
 * rule có thể lệch giữa startDate/dueDate. Nên gộp kết quả của hai truy vấn
 * (theo startDate và theo dueDate) rồi lọc chính xác lại ở phía ứng dụng.
 */
export async function fetchIssues(
  creds: Credentials,
  query: IssueQuery,
): Promise<IssuesResponse> {
  const base: Query = {
    "projectId[]": query.projectIds,
    "assigneeId[]": query.assigneeIds,
    "statusId[]": query.statusIds.length ? query.statusIds : [1, 2, 3, 4],
  };

  const ranges: Query[] = query.since && query.until
    ? [
        { dueDateSince: query.since, dueDateUntil: query.until },
        { startDateSince: query.since, startDateUntil: query.until },
      ]
    : [{}];

  const byId = new Map<number, BacklogIssue>();
  let truncated = false;

  for (const range of ranges) {
    const result = await fetchIssuePages(creds, { ...base, ...range });
    truncated = truncated || result.truncated;
    for (const issue of result.issues) byId.set(issue.id, issue);
  }

  // Lấy tất cả các loại ticket, chỉ loại trừ GTask (ticket gộp/umbrella dùng để
  // tổng hợp — hours của nó là cộng dồn từ các ticket con nên không tính riêng).
  const issues = [...byId.values()].filter((issue) => !isGroupTask(issue));

  return {
    issues,
    truncated,
    fetched: issues.length,
  };
}

/** Số parent id mỗi lần gọi, để URL không quá dài. */
const PARENT_BATCH_SIZE = 50;

/**
 * Cộng Actual Hours của toàn bộ task con (mọi trạng thái) theo từng G-Task.
 * Backlog chỉ có 1 cấp cha-con nên không cần đệ quy.
 */
export async function fetchChildTotals(
  creds: Credentials,
  parentIds: number[],
): Promise<{ totals: Record<number, ChildTotal>; truncated: boolean }> {
  const totals: Record<number, ChildTotal> = {};
  for (const id of parentIds) totals[id] = { count: 0, actualHours: 0 };
  let truncated = false;

  for (let start = 0; start < parentIds.length; start += PARENT_BATCH_SIZE) {
    const result = await fetchIssuePages(creds, {
      "parentIssueId[]": parentIds.slice(start, start + PARENT_BATCH_SIZE),
    });
    truncated = truncated || result.truncated;
    for (const child of result.issues) {
      const total = child.parentIssueId ? totals[child.parentIssueId] : undefined;
      if (!total) continue;
      total.count += 1;
      total.actualHours = round2(total.actualHours + (child.actualHours ?? 0));
    }
  }

  return { totals, truncated };
}

/**
 * G-Task của các project có [startDate, dueDate] giao với khoảng [from, to].
 * Backlog không lọc được kiểu "khoảng giao nhau" nên lấy hết G-Task (mọi trạng
 * thái, lọc theo issueTypeId nên số lượng nhỏ) rồi lọc lại ở đây. G-Task chưa
 * điền cả 2 ngày thì không xếp được vào khoảng nào: còn mở thì giữ lại để PM
 * thấy mà điền, đã Closed/Cancel thì bỏ — dữ liệu thật có rất nhiều G-Task cũ
 * kiểu này, giữ lại thì tháng nào cũng hiện ra.
 */
export async function fetchGroupTasks(
  creds: Credentials,
  query: { projectIds: number[]; from: string; to: string },
): Promise<GroupTasksResponse> {
  const typeLists = await Promise.all(
    query.projectIds.map((projectId) => fetchIssueTypes(creds, projectId)),
  );
  const typeIds = typeLists
    .flat()
    .filter((type) => isGroupTaskType(type.name))
    .map((type) => type.id);
  if (!typeIds.length) return { issues: [], childTotals: {}, truncated: false };

  const result = await fetchIssuePages(creds, {
    "projectId[]": query.projectIds,
    "issueTypeId[]": typeIds,
  });

  const issues = result.issues.filter((issue) => {
    const start = issue.startDate?.slice(0, 10) ?? null;
    const due = issue.dueDate?.slice(0, 10) ?? null;
    if (!start && !due) return !isFinishedStatus(issue.status);
    return (start ?? due!) <= query.to && (due ?? start!) >= query.from;
  });

  const children = await fetchChildTotals(
    creds,
    issues.map((issue) => issue.id),
  );

  return {
    issues,
    childTotals: children.totals,
    truncated: result.truncated || children.truncated,
  };
}
