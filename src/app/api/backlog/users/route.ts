import { NextResponse } from "next/server";

import { errorResponse, parseIdList } from "@/lib/api-route";
import {
  credentialsFromRequest,
  fetchProjectUsers,
  fetchSpaceUsers,
} from "@/lib/backlog";
import type { BacklogUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const projectIds = parseIdList(
      new URL(request.url).searchParams.get("projectIds"),
    );

    const lists = projectIds.length
      ? await Promise.all(
          projectIds.map((projectId) => fetchProjectUsers(creds, projectId)),
        )
      : [await fetchSpaceUsers(creds)];

    const byId = new Map<number, BacklogUser>();
    for (const user of lists.flat()) byId.set(user.id, user);

    return NextResponse.json(
      [...byId.values()]
        .map((user) => ({ id: user.id, name: user.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
