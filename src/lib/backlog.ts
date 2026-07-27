import "server-only";

import type {
  BacklogIssue,
  BacklogProject,
  BacklogUser,
  IssuesResponse,
} from "./types";

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
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(creds, path, query), {
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
    // 2 = chỉ lấy ticket con (có parentIssueId). Loại cả ticket cha lẫn
    // ticket độc lập (không cha không con) theo yêu cầu chỉ thống kê child-ticket.
    parentChild: 2,
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

  return {
    issues: [...byId.values()],
    truncated,
    fetched: byId.size,
  };
}
