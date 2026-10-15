import { NextResponse } from "next/server";

import { errorResponse, parseIdList } from "@/lib/api-route";
import {
  BacklogError,
  credentialsFromRequest,
  fetchChildTotals,
  fetchGroupTasks,
  fetchIssue,
  isGroupTask,
  updateActualHours,
} from "@/lib/backlog";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const params = new URL(request.url).searchParams;

    const projectIds = parseIdList(params.get("projectIds"));
    const from = params.get("from");
    const to = params.get("to");
    if (!projectIds.length) {
      return NextResponse.json({ error: "Chọn ít nhất 1 project." }, { status: 400 });
    }
    if (!from || !to || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return NextResponse.json(
        { error: "Thiếu khoảng ngày hợp lệ (from/to dạng yyyy-MM-dd)." },
        { status: 400 },
      );
    }

    return NextResponse.json(await fetchGroupTasks(creds, { projectIds, from, to }));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Ghi tổng Actual Hours của task con vào Actual Hours của G-Task. Tổng được tính
 * lại ngay tại đây chứ không nhận từ client, để không ghi số cũ nếu task con
 * vừa được sửa sau khi PM tải bảng.
 */
export async function PATCH(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const body = (await request.json().catch(() => null)) as { issueId?: unknown } | null;
    const issueId = Number(body?.issueId);
    if (!Number.isInteger(issueId) || issueId <= 0) {
      return NextResponse.json({ error: "Thiếu issueId hợp lệ." }, { status: 400 });
    }

    const issue = await fetchIssue(creds, issueId);
    if (!isGroupTask(issue)) {
      throw new BacklogError(`${issue.issueKey} không phải G-Task, không cập nhật.`, 400);
    }

    const { totals, truncated } = await fetchChildTotals(creds, [issueId]);
    if (truncated) {
      throw new BacklogError(
        `${issue.issueKey} có quá nhiều task con, không tính đủ tổng để cập nhật.`,
        422,
      );
    }

    const childTotal = totals[issueId];
    const updated = await updateActualHours(creds, issueId, childTotal.actualHours);
    return NextResponse.json({ issue: updated, childTotal });
  } catch (error) {
    return errorResponse(error);
  }
}
