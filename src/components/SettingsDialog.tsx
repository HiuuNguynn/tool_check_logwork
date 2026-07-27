"use client";

import { useEffect, useMemo, useState } from "react";

import {
  authHeaders,
  decodeAcmsToken,
  type Settings,
} from "@/lib/settings";
import { DEFAULT_FIELD_MAPPING } from "@/lib/types";

type Props = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => void;
};

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function SettingsDialog({ open, settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setTest({ kind: "idle" });
    }
  }, [open, settings]);

  const acmsInfo = useMemo(
    () => (draft.acmsToken.trim() ? decodeAcmsToken(draft.acmsToken) : null),
    [draft.acmsToken],
  );

  if (!open) return null;

  async function handleTest() {
    setTest({ kind: "testing" });
    try {
      const response = await fetch("/api/backlog/me", {
        headers: authHeaders(draft),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Kết nối thất bại");
      setTest({
        kind: "ok",
        message: `Đã kết nối ${body.domain} với tài khoản ${body.name}.`,
      });
    } catch (error) {
      setTest({
        kind: "error",
        message: error instanceof Error ? error.message : "Kết nối thất bại",
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold">Cài đặt kết nối</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Đóng
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <SectionLabel>Backlog</SectionLabel>
          <Field
            label="Backlog domain"
            hint="Ví dụ: amelainc.backlog.com (hoặc chỉ cần amelainc)"
          >
            <input
              value={draft.domain}
              onChange={(event) =>
                setDraft({ ...draft, domain: event.target.value })
              }
              placeholder="amelainc.backlog.com"
              className={inputClass}
            />
          </Field>

          <Field
            label="API key cá nhân"
            hint="Lấy tại Backlog → Personal Settings → API. Key chỉ lưu trong trình duyệt của bạn, không gửi đi đâu ngoài Backlog."
          >
            <input
              type="password"
              value={draft.apiKey}
              onChange={(event) =>
                setDraft({ ...draft, apiKey: event.target.value })
              }
              placeholder="••••••••••••"
              className={inputClass}
              autoComplete="off"
            />
          </Field>

          <SectionLabel>ACMS (chấm công + time dự án)</SectionLabel>
          <Field
            label="ACMS token"
            hint={
              <>
                Mở{" "}
                <span className="font-medium">me.amela.vn</span> → đăng nhập →
                mở DevTools (F12) → tab Network → bấm vào request bất kỳ tới{" "}
                <span className="font-medium">me-presentation.amela.vn</span> →
                copy giá trị header <code>Authorization</code> (bỏ chữ
                &quot;Bearer &quot;).
              </>
            }
          >
            <input
              type="password"
              value={draft.acmsToken}
              onChange={(event) =>
                setDraft({ ...draft, acmsToken: event.target.value })
              }
              placeholder="eyJ0eXAiOiJKV1Qi..."
              className={inputClass}
              autoComplete="off"
            />
          </Field>

          <p className="-mt-2 text-xs text-slate-500">
            Không bắt buộc. Để trống thì bảng thống kê theo ngày vẫn chạy bình
            thường, chỉ bỏ qua đối chiếu với chấm công / time dự án.
          </p>

          {draft.acmsToken.trim() && (
            <p
              className={`rounded-md px-3 py-2 text-sm ${
                acmsInfo && !acmsInfo.expired
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-rose-50 text-rose-800"
              }`}
            >
              {acmsInfo
                ? acmsInfo.expired
                  ? `Token đã hết hạn lúc ${acmsInfo.expiresAt?.toLocaleString("vi-VN")}.`
                  : `User ID ${acmsInfo.userId}${acmsInfo.divisionName ? ` · ${acmsInfo.divisionName}` : ""}${acmsInfo.positionName ? ` · ${acmsInfo.positionName}` : ""}${acmsInfo.expiresAt ? ` · hết hạn ${acmsInfo.expiresAt.toLocaleString("vi-VN")}` : ""}`
                : "Không đọc được token — kiểm tra lại đã copy đủ chuỗi chưa."}
            </p>
          )}

          <SectionLabel>Chung</SectionLabel>
          <Field label="Số giờ chuẩn mỗi ngày">
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={draft.targetHours}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  targetHours: Number(event.target.value) || 8,
                })
              }
              className={`${inputClass} w-32`}
            />
          </Field>

          <details className="rounded-lg border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Tên custom field (chỉ đổi khi project dùng tên khác)
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="Re-estimate hours">
                <input
                  value={draft.mapping.reEstimateHours}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      mapping: {
                        ...draft.mapping,
                        reEstimateHours: event.target.value,
                      },
                    })
                  }
                  placeholder={DEFAULT_FIELD_MAPPING.reEstimateHours}
                  className={inputClass}
                />
              </Field>
              <Field label="Actual End-date">
                <input
                  value={draft.mapping.actualEndDate}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      mapping: {
                        ...draft.mapping,
                        actualEndDate: event.target.value,
                      },
                    })
                  }
                  placeholder={DEFAULT_FIELD_MAPPING.actualEndDate}
                  className={inputClass}
                />
              </Field>
              <p className="text-xs text-slate-500">
                So khớp không phân biệt hoa thường, dấu cách và dấu gạch ngang.
              </p>
            </div>
          </details>

          {test.kind === "ok" && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {test.message}
            </p>
          )}
          {test.kind === "error" && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {test.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={handleTest}
            disabled={test.kind === "testing" || !draft.domain || !draft.apiKey}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {test.kind === "testing" ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.domain.trim() || !draft.apiKey.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </p>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
