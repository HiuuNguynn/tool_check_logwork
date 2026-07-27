import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-route";
import { credentialsFromRequest, fetchMyself } from "@/lib/backlog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const user = await fetchMyself(creds);
    return NextResponse.json({
      id: user.id,
      name: user.name,
      mailAddress: user.mailAddress ?? null,
      domain: creds.domain,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
