// Authentication & current-user endpoints (Module 1).
import { API_BASE, request } from "./client";
import type { User, UserSession } from "@/types/models";

export const authApi = {
  loginUrl: () => `${API_BASE}/api/v1/auth/azure/login`,
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/me"),
  devMakeAdmin: () => request<void>("/dev-make-admin", { method: "POST" }),

  // Device / session management (Module 1.1)
  listSessions: () =>
    request<{ sessions: UserSession[] }>("/me/sessions").then((r) => r.sessions),
  revokeSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/me/sessions/${sessionId}`, { method: "DELETE" }),

  // Two-factor authentication (Module 1.1)
  twoFactorStatus: () =>
    request<{ enabled: boolean; recoveryCodesLeft: number; enrolmentStarted: boolean }>(
      "/me/2fa",
    ),
  startTwoFactor: () =>
    request<{ secret: string; provisioningUri: string }>("/me/2fa/start", {
      method: "POST",
    }),
  enableTwoFactor: (code: string) =>
    request<{ enabled: boolean; recoveryCodes: string[] }>("/me/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  disableTwoFactor: (code: string) =>
    request<{ enabled: boolean }>("/me/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  /** Completes the login challenge with a TOTP or recovery code. */
  verifyTwoFactor: (code: string) =>
    request<User>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  // GDPR (Module 8)
  /** Downloads every record Flowie holds about the caller. */
  exportMyDataUrl: () => `${API_BASE}/api/v1/me/export`,
  deleteMyData: (confirmEmail: string) =>
    request<{ deleted: boolean }>("/me/delete", {
      method: "POST",
      body: JSON.stringify({ confirm: confirmEmail }),
    }),
};
