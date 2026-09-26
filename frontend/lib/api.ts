// Thin fetch wrapper for the FastAPI backend. Centralizing this makes it
// easy to change the base URL (env var) and to attach the auth token to
// every request without repeating boilerplate in each component.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("auth_token");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  // A FormData body (file uploads) needs the browser to set its own
  // multipart boundary in Content-Type — setting it ourselves breaks
  // the upload, so only default to JSON when the body isn't FormData.
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = "אירעה שגיאה בפנייה לשרת";
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // response had no JSON body; keep the default message
    }
    throw new ApiError(detail, response.status);
  }

  return response.json() as Promise<T>;
}
