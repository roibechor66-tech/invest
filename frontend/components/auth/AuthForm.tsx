"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

interface AuthFormProps {
  mode: "login" | "register";
}

// Shared form for both the login and register pages — same fields,
// different submit handler and copy.
export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "משהו השתבש, נסה שוב";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-card p-8 shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-900">
          {isRegister ? "יצירת חשבון" : "התחברות"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isRegister
            ? "הרשמה עם שם משתמש כדי שהמערכת תזכור את התיק וההגדרות שלך"
            : "התחברו כדי לגשת ללוח הבקרה האישי שלכם"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              שם משתמש
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
              placeholder="לדוגמה: roi_invest"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              סיסמה
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
              placeholder="לפחות 6 תווים"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {isSubmitting
              ? "רגע..."
              : isRegister
              ? "הרשמה"
              : "התחברות"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          {isRegister ? (
            <>
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="font-medium text-brand-400 hover:underline">
                התחברות
              </Link>
            </>
          ) : (
            <>
              עדיין אין לך חשבון?{" "}
              <Link href="/register" className="font-medium text-brand-400 hover:underline">
                הרשמה
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
