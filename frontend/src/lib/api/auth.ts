// Authentication & current-user endpoints (Module 1).
import { API_BASE, request } from "./client";
import type { User } from "@/types/models";

export const authApi = {
  loginUrl: () => `${API_BASE}/api/v1/auth/azure/login`,
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/me"),
  devMakeAdmin: () => request<void>("/dev-make-admin", { method: "POST" }),
};
