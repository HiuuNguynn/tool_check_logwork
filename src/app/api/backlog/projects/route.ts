import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-route";
import { credentialsFromRequest, fetchProjects } from "@/lib/backlog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const creds = credentialsFromRequest(request);
    const projects = await fetchProjects(creds);
    return NextResponse.json(
      projects
        .map((project) => ({
          id: project.id,
          projectKey: project.projectKey,
          name: project.name,
        }))
        .sort((a, b) => a.projectKey.localeCompare(b.projectKey)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
