"use client";

import { DEFAULT_FIELD_MAPPING, type FieldMapping } from "./types";

const STORAGE_KEY = "logwork.settings.v1";

export type Settings = {
  domain: string;
  apiKey: string;
  acmsToken: string;
  mapping: FieldMapping;
  targetHours: number;
};

export const DEFAULT_SETTINGS: Settings = {
  domain: process.env.NEXT_PUBLIC_BACKLOG_DOMAIN ?? "",
  apiKey: "",
  acmsToken: "",
  mapping: DEFAULT_FIELD_MAPPING,
  targetHours: 8,
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      domain: parsed.domain || DEFAULT_SETTINGS.domain,
      apiKey: parsed.apiKey || "",
      acmsToken: parsed.acmsToken || "",
      mapping: { ...DEFAULT_FIELD_MAPPING, ...(parsed.mapping ?? {}) },
      targetHours:
        typeof parsed.targetHours === "number" && parsed.targetHours > 0
          ? parsed.targetHours
          : 8,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function hasCredentials(settings: Settings): boolean {
  return Boolean(settings.domain.trim() && settings.apiKey.trim());
}

export function hasAcmsToken(settings: Settings): boolean {
  return Boolean(settings.acmsToken.trim());
}

/** API key / token đi trong header (không nằm trên URL) tới route handler của app. */
export function authHeaders(settings: Settings): HeadersInit {
  return {
    "x-backlog-domain": settings.domain.trim(),
    "x-backlog-api-key": settings.apiKey.trim(),
    "x-acms-token": settings.acmsToken.trim(),
  };
}

export function maskKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export type AcmsTokenInfo = {
  userId: number;
  positionName: string | null;
  divisionName: string | null;
  expiresAt: Date | null;
  expired: boolean;
};

/** Giải mã payload JWT ngay trong trình duyệt để xem trước, không cần gọi API. */
export function decodeAcmsToken(token: string): AcmsTokenInfo | null {
  const part = token.trim().split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + char.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const payload = JSON.parse(json) as {
      user_id?: number;
      position?: { name?: string };
      division?: { division_name?: string };
      exp?: number;
    };
    const userId = Number(payload.user_id);
    if (!userId) return null;

    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : null;
    return {
      userId,
      positionName: payload.position?.name ?? null,
      divisionName: payload.division?.division_name ?? null,
      expiresAt,
      expired: expiresAt ? expiresAt.getTime() < Date.now() : false,
    };
  } catch {
    return null;
  }
}
