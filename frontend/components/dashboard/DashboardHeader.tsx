"use client";

import { LineChart, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// Top page header: app name, tagline, and the logged-in user with a
// logout action.
export function DashboardHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-surface-border bg-surface-card px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white">
          <LineChart size={20} />
        </span>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">
            מערכת השקעות וניהול סיכונים
          </h1>
          <p className="text-xs text-slate-500">
            לוח בקרה אישי לניהול תיק, הערכות שווי ובריפים אוטומטיים
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-sm text-slate-500 sm:block">
          {new Date().toLocaleDateString("he-IL", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
        {user && (
          <div className="flex items-center gap-3 border-r border-surface-border pr-4">
            <span className="text-sm font-medium text-slate-700">
              שלום, {user.username}
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-slate-500 hover:border-negative/50 hover:text-negative"
            >
              <LogOut size={14} />
              התנתקות
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
