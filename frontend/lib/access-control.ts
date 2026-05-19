export type AccessRole = "public" | "candidate" | "employer";

type RouteAccessRule = {
  prefix: string;
  access: AccessRole;
};

export const AUTH_COOKIE_NAMES = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  clientRole: "16signals-role",
} as const;

export const AUTH_ROUTES = {
  login: "/auth",
  candidateHome: "/profile",
  employerHome: "/",
} as const;

/**
 * First match wins. Add future protected pages here instead of adding auth
 * checks inside page components.
 */
export const ROUTE_ACCESS_RULES: RouteAccessRule[] = [
  { prefix: "/profile", access: "candidate" },
  
  { prefix: "/browse", access: "public" },

  // Employer pages can be developed under /hr and are protected by default.
  { prefix: "/hr", access: "employer" },
] as const;

export function getRouteAccess(pathname: string): AccessRole {
  return (
    ROUTE_ACCESS_RULES.find((rule) => matchesRoutePrefix(pathname, rule.prefix))
      ?.access ?? "public"
  );
}

export function isProtectedRoute(pathname: string): boolean {
  return getRouteAccess(pathname) !== "public";
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
