import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-route";
import { credentialsFromRequest, fetchDueHistory } from "@/lib/backlog";

export const dynamic = "force-dynamic";

/**
 * Lịch sử sửa Due date của các subtask. Dùng POST vì danh sách id có thể dài
 * vài trăm phần tử, không nhét vừa query string.
 */
export async function POST(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const body = (await request.json().catch(() => null)) as { issueIds?: unknown } | null;
    const issueIds = Array.isArray(body?.issueIds)
      ? body.issueIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!issueIds.length) {
      return NextResponse.json({ error: "Thiếu danh sách issueIds." }, { status: 400 });
    }

    return NextResponse.json(await fetchDueHistory(creds, issueIds));
  } catch (error) {
    return errorResponse(error);
  }
}
