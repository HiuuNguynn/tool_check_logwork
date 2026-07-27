"use client";

function escapeCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}

export function downloadCsv(fileName: string, csv: string): void {
  // BOM để Excel nhận đúng UTF-8 (tên tiếng Việt/tiếng Nhật không bị lỗi font).
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
