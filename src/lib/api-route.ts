import "server-only";

import { NextResponse } from "next/server";

import { BacklogError } from "./backlog";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof BacklogError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Lỗi không xác định";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function parseIdList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}
