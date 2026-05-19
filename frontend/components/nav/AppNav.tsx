"use client";

import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { PublicNav } from "./PublicNav";
import { CandidateNav } from "./CandidateNav";
import { EmployerNav } from "./EmployerNav";

/**
 * Routes that explicitly render their own full-page nav.
 * Currently empty — the landing page now uses the global PublicNav.
 */
const MARKETING_ROUTES = new Set<string>([]);

/**
 * Smart navbar that auto-selects the correct variant based on auth state.
 * Placed in the root layout so every page always has a navbar.
 */
export function AppNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.role);
  const username = useAuthStore((s) => s.username);

  // Marketing pages have their own built-in Navigation component
  if (MARKETING_ROUTES.has(pathname)) return null;

  if (role === "employer") {
    return <EmployerNav companyName={username ?? "Employer"} />;
  }

  if (role === "candidate" && username) {
    return <CandidateNav username={username} />;
  }

  // Not logged in, show public nav (includes sign-in/get-started)
  return <PublicNav />;
}
