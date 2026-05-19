import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  AUTH_COOKIE_NAMES,
  AUTH_ROUTES,
  getRouteAccess,
  isProtectedRoute,
  type AccessRole,
} from "./lib/access-control";

export const config = {
  matcher: [
    /*
     * Run for app routes only. Static assets, Next internals, and common
     * metadata files stay out of the auth path.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)",
  ],
};

function decodeJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export default async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const requiredAccess = getRouteAccess(pathname);

    if (!isProtectedRoute(pathname)) {
      return NextResponse.next();
    }

    const accessToken = request.cookies.get(
      AUTH_COOKIE_NAMES.accessToken,
    )?.value;
    const refreshToken = request.cookies.get(
      AUTH_COOKIE_NAMES.refreshToken,
    )?.value;
    const clientRole = normalizeAccessRole(
      request.cookies.get(AUTH_COOKIE_NAMES.clientRole)?.value,
    );

    let payload = accessToken ? decodeJwt(accessToken) : null;
    const now = Math.floor(Date.now() / 1000);

    const isTokenValid = payload && payload.exp && payload.exp > now;
    let newCookies: string[] = [];

    if (!isTokenValid) {
      if (!refreshToken) {
        return redirectForInvalidAccess(request, requiredAccess);
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const refreshAccess =
        clientRole ?? normalizeAccessRole(payload?.role) ?? requiredAccess;
      const refreshEndpoint =
        refreshAccess === "employer"
          ? "/auth/employer/refresh"
          : "/auth/candidate/refresh";

      const refreshRes = await fetch(`${apiUrl}${refreshEndpoint}`, {
        method: "POST",
        headers: {
          Cookie: `refresh_token=${refreshToken}`,
        },
      });

      if (!refreshRes.ok) {
        return redirectForInvalidAccess(request, requiredAccess);
      }

      const setCookies = refreshRes.headers.getSetCookie
        ? refreshRes.headers.getSetCookie()
        : [];
      if (setCookies.length > 0) {
        newCookies = setCookies;
      } else {
        const fallbackCookie = refreshRes.headers.get("Set-Cookie");
        if (fallbackCookie) {
          newCookies = [fallbackCookie];
        }
      }

      try {
        const body = await refreshRes.json();
        if (body && body.data && body.data.accessToken) {
          payload = decodeJwt(body.data.accessToken);
        } else if (body && body.data && body.data.token) {
          payload = decodeJwt(body.data.token);
        } else if (body && body.access_token) {
          payload = decodeJwt(body.access_token);
        } else if (body && body.accessToken) {
          payload = decodeJwt(body.accessToken);
        }
      } catch (e) {
        // Fallback to previous payload if body parsing fails
      }
    }

    const role = resolveTokenRole(payload, clientRole);
    if (!role || !isRoleAllowed(role, requiredAccess)) {
      return redirectForInvalidAccess(request, requiredAccess, role);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-role", role);

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    if (newCookies.length > 0) {
      newCookies.forEach((cookie) =>
        response.headers.append("Set-Cookie", cookie),
      );
    }

    return response;
  } catch (error) {
    return redirectForInvalidAccess(request, "candidate");
  }
}

function normalizeAccessRole(role: unknown): AccessRole | null {
  if (typeof role !== "string") {
    return null;
  }

  const normalized = role.toLowerCase();
  if (normalized === "candidate" || normalized === "employer") {
    return normalized;
  }
  if (
    normalized === "recruiter" ||
    normalized === "hr" ||
    normalized === "hr_admin"
  ) {
    return "employer";
  }

  return null;
}

function resolveTokenRole(
  payload: Record<string, unknown> | null,
  clientRole: AccessRole | null,
): AccessRole | null {
  const tokenRole = normalizeAccessRole(payload?.role);

  if (tokenRole) {
    return tokenRole;
  }

  /*
   * Employer JWTs currently identify the company but do not include a role
   * claim. Use the non-HttpOnly role cookie only as a fallback for that shape;
   * candidate tokens always carry `role`, so a tampered role cookie cannot turn
   * a candidate JWT into an employer session.
   */
  if (clientRole === "employer" && payload?.sub) {
    return "employer";
  }

  return null;
}

function isRoleAllowed(role: AccessRole, requiredAccess: AccessRole): boolean {
  if (requiredAccess === "public") {
    return true;
  }
  return role === requiredAccess;
}

function redirectForInvalidAccess(
  request: NextRequest,
  requiredAccess: AccessRole,
  actualRole?: AccessRole | null,
) {
  if (actualRole === "candidate") {
    return NextResponse.redirect(
      new URL(AUTH_ROUTES.candidateHome, request.url),
    );
  }

  if (actualRole === "employer") {
    return NextResponse.redirect(
      new URL(AUTH_ROUTES.employerHome, request.url),
    );
  }

  const redirectUrl = new URL(AUTH_ROUTES.login, request.url);
  redirectUrl.searchParams.set("clear_session", "true");
  return NextResponse.redirect(redirectUrl);
}
