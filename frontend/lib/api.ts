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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    // No HTTP response at all: the connection dropped — typically the
    // server restarting mid-request (a deploy) or waking from sleep.
    throw new ApiError(
      "החיבור לשרת נותק (ייתכן שהשרת התעדכן או התעורר כרגע) — נסו שוב בעוד דקה",
      0
    );
  }

  if (!response.ok) {
    let detail = "אירעה שגיאה בפנייה לשרת";
    try {
      const body = await response.json();
      // FastAPI's own 422 validation errors send `detail` as an array of
      // objects — rendering that as a message would crash React, so only
      // a string detail is shown.
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // response had no JSON body; keep the default message
    }
    throw new ApiError(detail, response.status);
  }

  return response.json() as Promise<T>;
}
