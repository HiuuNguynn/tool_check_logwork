import type { ChildTask } from "./types";

/**
 * Quy ước tên subtask theo Guideline đo Performance (Trục Năng suất, Phần 6):
 * `[mã][Role] Tên công việc`, VD `[code][BE] API đăng ký thông báo`.
 */
export type SubtaskRole = "BA" | "Designer" | "BE" | "FE" | "Tester";

/** Danh mục công việc chuẩn của từng role (Phần 6.1 → 6.5). */
const CATALOG: Record<SubtaskRole, readonly string[]> = {
  BA: ["srs", "g4", "h3", "g5", "csv", "rvd-ui", "rv-tc", "cr", "uat", "fl", "nfr", "man"],
  Designer: ["ui", "ui-st", "ui-fix", "ui-qa", "asset", "dsys"],
  BE: ["rvd-srs", "dd", "db", "code", "int", "batch", "ut", "api-doc", "prv", "fix", "dep"],
  FE: ["rvd-ui", "rvd-srs", "dd", "code", "api-int", "val", "ut", "cbt", "prv", "fix", "build"],
  Tester: ["rvd-srs", "rvd-ui", "tc", "tdata", "itst", "bug", "retest", "reg", "perf"],
};

/** "Dev BE" / "be" / "QC" ... -> role chuẩn. */
function normalizeRole(raw: string): SubtaskRole | null {
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "").replace(/^dev/, "");
  if (key === "ba") return "BA";
  if (key === "designer" || key === "design") return "Designer";
  if (key === "be" || key === "backend") return "BE";
  if (key === "fe" || key === "frontend") return "FE";
  if (key === "tester" || key === "qc" || key === "test") return "Tester";
  return null;
}

export type SubtaskTag = { code: string; role: SubtaskRole };

/** null = tiêu đề chưa đúng quy ước (thiếu tag, role lạ, hoặc mã không có trong danh mục). */
export function parseSubtaskTag(summary: string): SubtaskTag | null {
  const match = /^\s*\[([^\]]+)\]\s*\[([^\]]+)\]/.exec(summary);
  if (!match) return null;
  const code = match[1].trim().toLowerCase();
  const role = normalizeRole(match[2]);
  if (!role || !CATALOG[role].includes(code)) return null;
  return { code, role };
}

/**
 * Subtask được đánh giá: bỏ ticket Bug/Feedback (guideline không đánh giá bug
 * như một task riêng), G-Task lồng nhau, và subtask bị Cancel (đóng vì không
 * thực hiện / không hợp lệ / trùng lặp).
 */
export function isEvaluatedSubtask(task: ChildTask): boolean {
  const type = task.issueTypeName.toLowerCase();
  if (/bug|feedback/.test(type)) return false;
  if (type.replace(/[\s_-]+/g, "") === "gtask") return false;
  return !/^cancel/i.test(task.statusName.trim());
}

/**
 * Subtask BẮT BUỘC áp dụng cho mọi Story chức năng. `[ui][Designer]` cũng bắt
 * buộc nhưng chỉ khi Story có màn hình mới — tool không biết điều đó nên không
 * check. `[code]` chỉ cần có ở BE hoặc FE (Story chỉ BE / chỉ giao diện).
 */
const REQUIRED: { label: string; matches: (tag: SubtaskTag) => boolean }[] = [
  { label: "[srs][BA]", matches: (tag) => tag.code === "srs" && tag.role === "BA" },
  {
    label: "[code][BE/FE]",
    matches: (tag) => tag.code === "code" && (tag.role === "BE" || tag.role === "FE"),
  },
  { label: "[tc][Tester]", matches: (tag) => tag.code === "tc" && tag.role === "Tester" },
  { label: "[itst][Tester]", matches: (tag) => tag.code === "itst" && tag.role === "Tester" },
];

export function checkRequiredSubtasks(tasks: ChildTask[]): {
  missingRequired: string[];
  offConventionCount: number;
} {
  const evaluated = tasks.filter(isEvaluatedSubtask);
  const tags = evaluated
    .map((task) => parseSubtaskTag(task.summary))
    .filter((tag): tag is SubtaskTag => tag !== null);

  return {
    missingRequired: REQUIRED.filter((rule) => !tags.some(rule.matches)).map(
      (rule) => rule.label,
    ),
    offConventionCount: evaluated.length - tags.length,
  };
}
