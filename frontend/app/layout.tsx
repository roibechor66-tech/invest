import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

// Root layout: sets Hebrew language + RTL direction for the entire app.
// All visible text in the UI is Hebrew; code/comments stay in English.
export const metadata: Metadata = {
  title: "מערכת השקעות וניהול סיכונים",
  description: "פלטפורמת השקעות אישית לניהול תיק, הערכת שווי ובריפים אוטומטיים",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-surface font-sans text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
