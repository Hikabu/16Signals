"use client";

// Nav is handled globally by AppNav in the root layout.
// This layout only keeps the client-side role guard as a safety net
// beyond middleware.
import { useAuthStore } from "@/lib/auth-store";
import { redirect } from "next/navigation";

export default function HrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = useAuthStore((s) => s.role);

  if (role && role !== "employer") {
    redirect("/");
  }

  return <main className="min-h-screen">{children}</main>;
}
