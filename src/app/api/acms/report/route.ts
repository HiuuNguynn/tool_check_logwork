import { NextResponse } from "next/server";

import {
  AcmsError,
  credentialsFromToken,
  fetchDailyReportsMonth,
  fetchTimesheetMonth,
} from "@/lib/acms";
import { monthsBetween } from "@/lib/date";
import type { AcmsDailyData } from "@/lib/types";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AcmsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Lỗi không xác định";
  return NextResponse.json({ error: message }, { status: 500 });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const token = (
      request.headers.get("x-acms-token") ||
      process.env.ACMS_TOKEN ||
      ""
    ).trim();
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu ACMS token. Vào Cài đặt để nhập." },
        { status: 401 },
      );
    }
    const creds = credentialsFromToken(token);

    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return NextResponse.json(
        { error: "Thiếu khoảng ngày hợp lệ (from/to dạng yyyy-MM-dd)." },
        { status: 400 },
      );
    }

    const result: AcmsDailyData = {
      attendance: {},
      projectTool: {},
      projectToolEntries: {},
    };

    for (const month of monthsBetween(from, to)) {
      const [year, monthNumber] = month.split("-");
      const [timesheet, reports] = await Promise.all([
        fetchTimesheetMonth(creds, `${monthNumber}/${year}`),
        fetchDailyReportsMonth(creds, month),
      ]);
      for (const [date, attendanceDay] of timesheet) {
        result.attendance[date] = attendanceDay;
      }
      for (const [date, day] of reports) {
        result.projectTool[date] = day.hours;
        result.projectToolEntries[date] = day.entries;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
