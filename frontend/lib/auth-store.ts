"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import Cookies from "js-cookie";

import { AUTH_COOKIE_NAMES } from "./access-control";

export type AuthRole = "candidate" | "employer";

const TOKEN_COOKIE_NAME = "16signals-token";
const ROLE_COOKIE_NAME = AUTH_COOKIE_NAMES.clientRole;
const PERSIST_KEY = "16signals-auth";

type AuthState = {
  token: string | null;
  role: AuthRole | null;
  username: string | null;
  email: string | null;
  walletAddress: string | null;
  id: string | null;
  setAuth: (auth: {
    token?: string | null;
    role?: AuthRole | string | null;
    username?: string | null;
    email?: string | null;
    walletAddress?: string | null;
    id?: string | null;
  }) => void;
  clearAuth: () => void;
  /**
   * Full logout: clears Zustand, cookies, localStorage persist key, and
   * dispatches a custom `auth:logout` DOM event so the AppProviders router
   * listener can navigate to /auth without the store importing Next.js router.
   */
  logout: () => void;
};

function normalizeRole(role?: AuthRole | string | null): AuthRole | null {
  if (!role) {
    return null;
  }

  const normalized = role.toLowerCase();
  if (normalized === "candidate" || normalized === "employer") {
    return normalized;
  }
  if (normalized === "recruiter") {
    return "employer";
  }

  return null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      username: null,
      email: null,
      walletAddress: null,
      id: null,

      setAuth: ({ token, role, username, email, walletAddress, id }) => {
        const normalizedRole = normalizeRole(role);

        // Sync with cookies for middleware
        if (token !== undefined) {
          if (token) {
            Cookies.set(TOKEN_COOKIE_NAME, token, { expires: 7, path: "/" });
          } else {
            Cookies.remove(TOKEN_COOKIE_NAME);
          }
        }

        if (normalizedRole) {
          Cookies.set(ROLE_COOKIE_NAME, normalizedRole, { expires: 7, path: "/" });
        } else if (role === null) {
          Cookies.remove(ROLE_COOKIE_NAME);
        }

        set((state) => ({
          token: token ?? state.token,
          role: normalizedRole ?? state.role,
          username: username ?? state.username,
          email: email ?? state.email,
          walletAddress: walletAddress ?? state.walletAddress,
          id: id ?? state.id,
        }));
      },

      clearAuth: () => {
        Cookies.remove(TOKEN_COOKIE_NAME);
        Cookies.remove(ROLE_COOKIE_NAME);
        set({ token: null, role: null, username: null, email: null, walletAddress: null, id: null });
      },

      logout: () => {
        // 1. Clear cookies
        Cookies.remove(TOKEN_COOKIE_NAME);
        Cookies.remove(ROLE_COOKIE_NAME);

        // 2. Clear Zustand state
        set({ token: null, role: null, username: null, email: null, walletAddress: null, id: null });

        // 3. Clear the Zustand persist storage (localStorage key)
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem(PERSIST_KEY);
          } catch {
            // Storage may be unavailable (SSR/incognito edge cases)
          }

          // 4. Notify the router listener in AppProviders to navigate to /auth
          window.dispatchEvent(new Event("auth:logout"));
        }
      },
    }),
    { name: PERSIST_KEY },
  ),
);

if (typeof globalThis !== "undefined") {
  globalThis.useAuthStore = useAuthStore;
}
