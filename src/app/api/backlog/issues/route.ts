import { NextResponse } from "next/server";

import { errorResponse, parseIdList } from "@/lib/api-route";
import { credentialsFromRequest, fetchIssues } from "@/lib/backlog";
import { shiftDays } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * Nới rộng khoảng ngày gửi lên Backlog: một ticket sai rule có thể có Actual
 * End-date nằm trong khoảng thống kê nhưng startDate/dueDate lại lệch ra ngoài.
 */
const RANGE_PADDING_DAYS = 31;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string | null): string | null {
  return value && DATE_PATTERN.test(value) ? value : null;
}

export async function GET(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const params = new URL(request.url).searchParams;

    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"));
    if (!from || !to) {
      return NextResponse.json(
        { error: "Thiếu khoảng ngày hợp lệ (from/to dạng yyyy-MM-dd)." },
        { status: 400 },
      );
    }
    if (from > to) {
      return NextResponse.json(
        { error: "Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc." },
        { status: 400 },
      );
    }

    const result = await fetchIssues(creds, {
      projectIds: parseIdList(params.get("projectIds")),
      assigneeIds: parseIdList(params.get("assigneeIds")),
      statusIds: parseIdList(params.get("statusIds")),
      since: shiftDays(from, -RANGE_PADDING_DAYS),
      until: shiftDays(to, RANGE_PADDING_DAYS),
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
