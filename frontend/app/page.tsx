import { redirect } from "next/navigation";

// Root route simply forwards to the dashboard.
export default function HomePage() {
  redirect("/dashboard");
}
