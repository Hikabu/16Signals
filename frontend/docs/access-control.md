# Frontend Page Access

Page access is centralized in `frontend/lib/access-control.ts` and enforced by
`frontend/middleware.ts` before a protected page loads.

## Access Types

- `public`: no login required. This is the default for routes not listed in
  `ROUTE_ACCESS_RULES`.
- `candidate`: requires a valid candidate session.
- `employer`: requires a valid employer session.

Current rules:

```ts
export const ROUTE_ACCESS_RULES = [
  { prefix: "/profile", access: "candidate" },
  { prefix: "/hr", access: "employer" },
];
```

First matching prefix wins. A rule for `/profile` covers `/profile` and
`/profile/settings`.

## Adding a New Page

1. Create the page under `frontend/app`.
2. Decide the access type.
3. If it is public, do nothing unless a broader protected prefix already covers
   it.
4. If it is protected, add or update one entry in `ROUTE_ACCESS_RULES`.

Examples:

```ts
// Candidate-only page
{ prefix: "/profile", access: "candidate" }

// Employer-only page
{ prefix: "/hr", access: "employer" }

// Public page
// No rule needed
```

## Auth Behavior

The frontend and backend use shared session cookies:

- `access_token`: short-lived JWT.
- `refresh_token`: rotating refresh JWT.
- `16signals-role`: client-readable role hint used only to choose the right
  rehydration path and as a fallback for legacy employer tokens.

On a protected request, middleware checks the required access type, validates
`access_token`, and refreshes through the matching endpoint when needed:

- candidates: `POST /auth/candidate/refresh`
- employers: `POST /auth/employer/refresh`

Do not put page-level auth redirects in React page components for protected
pages. Add the route to `ROUTE_ACCESS_RULES` instead so unauthorized users never
load the page.
