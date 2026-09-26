"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { API_BASE_URL, ApiError } from "@/lib/api";

interface AuthUser {
  id: number;
  username: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean; // true while restoring session from localStorage
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Wraps the app and remembers the logged-in user (via a JWT stored in
// localStorage) so returning visitors don't have to log in every visit.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, restore any previously saved session.
  useEffect(() => {
    const savedToken = window.localStorage.getItem("auth_token");
    const savedUser = window.localStorage.getItem("auth_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  function persistSession(newToken: string, newUser: AuthUser) {
    window.localStorage.setItem("auth_token", newToken);
    window.localStorage.setItem("auth_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  async function register(username: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.detail ?? "ההרשמה נכשלה", response.status);
    }
    const data = await response.json();
    persistSession(data.access_token, data.user);
    // Marks that this session came from a brand-new signup, so the
    // dashboard can show the one-time portfolio-building nudge — kept
    // entirely separate from the legal disclaimer's own "seen it"
    // flag, since the two are shown on different triggers.
    window.localStorage.setItem("just_registered", "1");
  }

  async function login(username: string, password: string) {
    // FastAPI's OAuth2PasswordRequestForm expects form-encoded data.
    const form = new URLSearchParams();
    form.set("username", username);
    form.set("password", password);

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(
        body.detail ?? "שם משתמש או סיסמה שגויים",
        response.status
      );
    }
    const data = await response.json();
    persistSession(data.access_token, data.user);
  }

  function logout() {
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_user");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
