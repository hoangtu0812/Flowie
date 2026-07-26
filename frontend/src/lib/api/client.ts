// Low-level HTTP client for the Flowie backend API. All requests send the
// session cookie (credentials: "include") so the httpOnly Azure AD session is
// used. Domain modules (tasks, projects, …) build on top of `request`.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  /** Machine-readable code from the backend's `error` field, e.g. "no_folder".
   *  Branch on this rather than matching the localised `message`. */
  code: string;
  constructor(status: number, message: string, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    let code = "";
    try {
      const body = await res.json();
      msg = body.message || body.error || msg;
      code = body.error || "";
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
