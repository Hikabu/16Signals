import type { paths } from "@/src/api/schema";
import { useAuthStore } from "./auth-store";
import { AUTH_COOKIE_NAMES } from "./access-control";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
type ApiOperation<
  Path extends keyof paths,
  Method extends HttpMethod,
> = NonNullable<paths[Path][Method]>;
type OperationParameters<Operation> = Operation extends {
  parameters: infer Parameters;
}
  ? Parameters
  : never;
type PathParams<Operation> =
  OperationParameters<Operation> extends { path: infer Params }
    ? Params
    : never;
type QueryParams<Operation> =
  OperationParameters<Operation> extends { query?: infer Params }
    ? Params
    : never;
type HeaderParams<Operation> =
  OperationParameters<Operation> extends { header: infer Params }
    ? Params
    : OperationParameters<Operation> extends { header?: infer Params }
      ? Params
      : never;
type JsonRequestBody<Operation> = Operation extends {
  requestBody?: { content: { "application/json": infer Body } };
}
  ? Body
  : never;
type JsonResponseBody<Response> = Response extends {
  content: { "application/json": infer Body };
}
  ? Body
  : void;
type ApiResponse<Operation> = Operation extends { responses: infer Responses }
  ? 200 extends keyof Responses
    ? JsonResponseBody<Responses[200]>
    : 201 extends keyof Responses
      ? JsonResponseBody<Responses[201]>
      : 204 extends keyof Responses
        ? void
        : 202 extends keyof Responses
          ? JsonResponseBody<Responses[202]>
          : unknown
  : never;
type BodyRequestField<Operation> = [JsonRequestBody<Operation>] extends [never]
  ? {}
  : Operation extends { requestBody: unknown }
    ? { body: JsonRequestBody<Operation> }
    : { body?: JsonRequestBody<Operation> };
type ApiRequest<Operation> = ([PathParams<Operation>] extends [never]
  ? {}
  : { path: PathParams<Operation> }) &
  ([QueryParams<Operation>] extends [never]
    ? {}
    : { query?: QueryParams<Operation> }) &
  ([HeaderParams<Operation>] extends [never]
    ? {}
    : { headers: HeaderParams<Operation> }) &
  BodyRequestField<Operation>;

type ApiRequestParts = {
  path?: Record<string, string | number | boolean>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
};

type AuthStoreSnapshot = { token?: string | null; role?: AuthRole | null };
type AuthStoreHook = {
  getState?: () => AuthStoreSnapshot;
};

declare global {
  // Keeps the API layer independent while still supporting the app's Zustand auth store shape.
  var useAuthStore: AuthStoreHook | undefined;
}

export type ApiErrorBody = unknown;

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type ApiFetchOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  /** When true, the Authorization header is omitted entirely (e.g. public endpoints). */
  skipAuth?: boolean;
  /** Internal flag to prevent infinite loops during token refresh */
  retried?: boolean;
  /**
   * Selects role-specific auth behavior for shared-cookie endpoints. Candidate
   * sessions can refresh; employer sessions currently cannot.
   */
  authRole?: AuthRole;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const COOKIE_AUTH_TOKEN = "__cookie_auth__";

let refreshingPromise: Promise<void> | null = null;

function getAuthToken(): string | null {
  const useAuthStore = globalThis.useAuthStore;

  return useAuthStore?.getState?.().token ?? null;
}

function getAuthRole(): AuthRole | null {
  const useAuthStore = globalThis.useAuthStore;

  return useAuthStore?.getState?.().role ?? null;
}

export function getApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  return new URL(path, API_BASE_URL).toString();
}

function getRequestParts(request: unknown): ApiRequestParts {
  return (request ?? {}) as ApiRequestParts;
}

/**
 * Use before calling job-scoped APIs (`/jobs/:id`, `/applications/hr/jobs/:jobId`, `/escrow/status/:jobPostId`).
 * Sidebar links like `/hr/jobs/active` are handled by `[id]` and must not hit the network as IDs.
 */
export function isValidJobPostPathId(
  id: string | undefined | null,
): id is string {
  if (id == null || id === "") return false;
  if (id === "draft" || id === "active") return false;
  return true;
}

/** Backend wraps most payloads as `{ success, data }`. */
export function unwrapApiSuccessData<T>(response: unknown): T {
  if (
    response &&
    typeof response === "object" &&
    "success" in response &&
    (response as { success?: boolean }).success === true &&
    "data" in response
  ) {
    return (response as { data: T }).data;
  }
  return response as T;
}

/** Normalize enum job status from the API (e.g. `DRAFT` → `draft`). */
export function normalizeJobStatus(status: unknown): string {
  return String(status ?? "").toLowerCase();
}

function withPathParams(
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  if (!params) {
    return path;
  }

  return Object.entries(params).reduce(
    (resolvedPath, [key, value]) =>
      resolvedPath.replace(`{${key}}`, encodeURIComponent(String(value))),
    path,
  );
}

function appendQueryParams(url: URL, query?: Record<string, unknown>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();

  if (!text) {
    return undefined;
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return JSON.parse(text);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<ResponseBody>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<ResponseBody> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const {
    body: requestBody,
    headers: customHeaders,
    query,
    skipAuth,
    retried,
    authRole,
    ...fetchOptions
  } = options;

  const url = new URL(path, API_BASE_URL);
  appendQueryParams(url, query);

  async function executeRequest() {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...customHeaders,
    };

    const init: RequestInit = {
      credentials: "include",
      ...fetchOptions,
      headers,
    };

    if (requestBody !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";

      init.body = JSON.stringify(requestBody);
    }

    const response = await fetch(url.toString(), init);
    const body = await parseResponseBody(response);

    return { response, body };
  }

  // ─────────────────────────────
  // 1. First request
  // ─────────────────────────────
  let { response, body } = await executeRequest();

  if (response.ok) {
    return body as ResponseBody;
  }

  // ─────────────────────────────
  // 2. Handle 401 refresh
  // ─────────────────────────────
  if (response.status === 401 && !retried && !skipAuth) {
    const refreshRole = authRole ?? getAuthRole() ?? "candidate";

    if (!refreshingPromise) {
      const refreshPath =
        refreshRole === "employer"
          ? "/auth/employer/refresh"
          : "/auth/candidate/refresh";

      refreshingPromise = fetch(API_BASE_URL + refreshPath, {
        method: "POST",
        credentials: "include",
      })
        .then(async (r) => {
          console.log("REFRESH STATUS", r.status);

          if (!r.ok) {
            console.log("REFRESH FAILED");

            useAuthStore.getState().clearAuth();

            throw new Error("Session expired");
          }

          console.log("REFRESH SUCCESS");
        })
        .finally(() => {
          refreshingPromise = null;
        });
    }

    await refreshingPromise;

    // retry original request
    return apiFetch<ResponseBody>(path, {
      ...options,
      retried: true,
    });
  }

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body as ResponseBody;
}

export type AuthRole = "candidate" | "employer";

export type AuthResponse = {
  token: string;
  role: AuthRole;
  username?: string | null;
  email?: string | null;
  walletAddress?: string | null;
  id?: string | null;
};

export type AuthUrlResponse = {
  url: string;
};

export type CandidateLoginInput = {
  email: string;
  password: string;
};

export type CandidateRegisterInput = {
  email: string;
  password: string;
  username: string;
};

export type EmployerLoginInput = {
  privyToken: string;
};

export type PasswordResetRequestInput = {
  email: string;
};

export type PasswordResetConfirmInput = {
  token: string;
  newPassword: string;
};

export type VerifyEmailInput = {
  code: string;
};

export type CompleteOnboardingInput = {
  username: string;
  role?: AuthRole;
  displayName?: string;
};

export type VerifyMfaInput = {
  userId?: string;
  code: string;
  mfaToken: string;
};

export type VerifyMfaRecoveryInput = {
  userId?: string;
  backupCode: string;
  mfaToken: string;
};

export type EmployerPrivyLoginInput = EmployerLoginInput;

export type MfaRequiredBody = {
  code: "mfa_required";
  token?: string;
  mfaToken?: string;
  userId?: string;
  message?: string;
};

export type EmailVerificationRequiredBody = {
  code: "email_verification_required";
  email?: string;
  message?: string;
};

type ApiErrorLikeBody = {
  code?: string;
  message?: string | string[];
  token?: string;
  mfaToken?: string;
  userId?: string;
};

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong.",
): string {
  if (error instanceof ApiError) {
    const body = error.body as ApiErrorLikeBody | undefined;
    if (Array.isArray(body?.message)) {
      return body.message.join(", ");
    }
    return body?.message ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function getMfaRequiredBody(error: unknown): MfaRequiredBody | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const body = error.body as ApiErrorLikeBody | undefined;
  if (body?.code !== "mfa_required") {
    return null;
  }

  return {
    code: "mfa_required",
    token: body.token,
    mfaToken: body.mfaToken,
    userId: body.userId,
    message: typeof body.message === "string" ? body.message : undefined,
  };
}

export function getEmailVerificationRequiredBody(
  error: unknown,
): EmailVerificationRequiredBody | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const body = error.body as ApiErrorLikeBody & { email?: string };
  if (body?.code !== "email_verification_required") {
    return null;
  }

  return {
    code: "email_verification_required",
    email: typeof body.email === "string" ? body.email : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
  };
}

function normalizeRole(role: unknown, fallback: AuthRole): AuthRole {
  if (typeof role !== "string") {
    return fallback;
  }

  const normalized = role.toLowerCase();
  if (normalized === "candidate" || normalized === "employer") {
    return normalized;
  }
  if (normalized === "recruiter") {
    return "employer";
  }

  return fallback;
}

function normalizeAuthResponse(
  body: unknown,
  fallbackRole: AuthRole,
): AuthResponse {
  const record = (body ?? {}) as Record<string, unknown>;
  const nested =
    typeof record.data === "object" && record.data
      ? (record.data as Record<string, unknown>)
      : typeof record.auth === "object" && record.auth
        ? (record.auth as Record<string, unknown>)
        : record;
  const token =
    typeof nested.token === "string"
      ? nested.token
      : typeof nested.accessToken === "string"
        ? nested.accessToken
        : typeof nested.jwt === "string"
          ? nested.jwt
          : "";

  if (!token) {
    if (record.success === true) {
      return {
        token: COOKIE_AUTH_TOKEN,
        role: fallbackRole,
        username: typeof nested.username === "string" ? nested.username : null,
      };
    }

    throw new Error("Authentication response did not include a token.");
  }

  return {
    token,
    role: normalizeRole(nested.role, fallbackRole),
    username: typeof nested.username === "string" ? nested.username : null,
    email: typeof nested.email === "string" ? nested.email : null,
    walletAddress:
      typeof nested.walletAddress === "string" ? nested.walletAddress : null,
    id: typeof nested.id === "string" ? nested.id : null,
  };
}

export async function loginCandidate(
  input: CandidateLoginInput,
): Promise<AuthResponse> {
  const body = await AuthCandidateController_login({
    headers: undefined,
    body: { identifier: input.email, password: input.password },
  });
  return normalizeAuthResponse(body, "candidate");
}

export async function logoutCandidate(): Promise<void> {
  await AuthCandidateController_logout();
}

export async function registerCandidate(
  input: CandidateRegisterInput,
): Promise<void> {
  await AuthCandidateController_register({
    headers: undefined,
    body: {
      email: input.email,
      username: input.username,
      password: input.password,
      role: "CANDIDATE",
    },
  });
}

export async function getGithubAuthUrl(): Promise<AuthUrlResponse> {
  return { url: getApiUrl("/auth/candidate/github") };
}

export async function getGoogleAuthUrl(): Promise<AuthUrlResponse> {
  return { url: getApiUrl("/auth/candidate/google") };
}

export async function loginEmployer(
  input: EmployerLoginInput,
): Promise<AuthResponse> {
  return loginEmployerPrivy(input);
}

export async function logoutEmployer(): Promise<void> {
  await AuthEmployerController_logout();
}

export async function requestPasswordReset(
  input: PasswordResetRequestInput,
): Promise<void> {
  await AuthCandidateController_requestPasswordReset({
    headers: undefined,
    body: input,
  });
}

export async function confirmPasswordReset(
  input: PasswordResetConfirmInput,
): Promise<void> {
  await AuthCandidateController_resetPassword({
    headers: undefined,
    body: input,
  });
}

export async function verifyEmail(input: VerifyEmailInput): Promise<unknown> {
  return AuthCandidateController_verifyEmail({
    headers: undefined,
    body: input,
  });
}

export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<AuthResponse> {
  const body = await AuthCandidateController_completeOnboarding({
    headers: undefined,
    body: { username: input.username },
  });
  return normalizeAuthResponse(
    { ...(body as Record<string, unknown> | undefined), role: input.role },
    input.role ?? "candidate",
  );
}

export async function verifyMfa(input: VerifyMfaInput): Promise<AuthResponse> {
  const body = await AuthCandidateController_verifyMfa({
    headers: undefined,
    body: {
      userId: input.userId ?? "00000000-0000-0000-0000-000000000000",
      code: input.code,
      mfaToken: input.mfaToken,
    },
  });
  return normalizeAuthResponse(body, "candidate");
}

export async function verifyMfaRecovery(
  input: VerifyMfaRecoveryInput,
): Promise<AuthResponse> {
  const body = await AuthCandidateController_verifyMfaRecovery({
    headers: undefined,
    body: {
      userId: input.userId ?? "00000000-0000-0000-0000-000000000000",
      backupCode: input.backupCode,
      mfaToken: input.mfaToken,
    },
  });
  return normalizeAuthResponse(body, "candidate");
}

export async function loginEmployerPrivy(
  input: EmployerPrivyLoginInput,
): Promise<AuthResponse> {
  const body = await apiFetch<unknown>("/auth/employer/login", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.privyToken}`,
    },
  });
  return normalizeAuthResponse(body, "employer");
}

export type EmployerProfileResponse = {
  id: string;
  name: string;
  email: string | null;
  walletAddress: string | null;
  privyId: string | null;
  // there may be other fields but we only care about these right now
};

export async function getEmployerProfile(): Promise<EmployerProfileResponse> {
  const body = await apiFetch<Record<string, unknown>>("/me/company", {
    method: "GET",
    authRole: "employer",
  });

  if (body.data && typeof body.data === "object") {
    return body.data as EmployerProfileResponse;
  }

  return body as unknown as EmployerProfileResponse;
}

type AnalyticsController_getDashboardOperation = ApiOperation<
  "/analytics/dashboard",
  "get"
>;
export type AnalyticsController_getDashboardRequest =
  ApiRequest<AnalyticsController_getDashboardOperation>;
export type AnalyticsController_getDashboardResponse =
  ApiResponse<AnalyticsController_getDashboardOperation>;
export async function AnalyticsController_getDashboard(
  request?: AnalyticsController_getDashboardRequest,
): Promise<AnalyticsController_getDashboardResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AnalyticsController_getDashboardResponse>(
    withPathParams("/analytics/dashboard", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_getGapPreviewOperation = ApiOperation<
  "/applications/me/gap-preview",
  "get"
>;
export type ApplicantsController_getGapPreviewRequest =
  ApiRequest<ApplicantsController_getGapPreviewOperation>;
export type ApplicantsController_getGapPreviewResponse =
  ApiResponse<ApplicantsController_getGapPreviewOperation>;
export async function ApplicantsController_getGapPreview(
  request?: ApplicantsController_getGapPreviewRequest,
): Promise<ApplicantsController_getGapPreviewResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_getGapPreviewResponse>(
    withPathParams("/applications/me/gap-preview", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_applyOperation = ApiOperation<
  "/applications/me/{jobId}",
  "post"
>;
export type ApplicantsController_applyRequest =
  ApiRequest<ApplicantsController_applyOperation>;
export type ApplicantsController_applyResponse =
  ApiResponse<ApplicantsController_applyOperation>;
export async function ApplicantsController_apply(
  request: ApplicantsController_applyRequest,
): Promise<ApplicantsController_applyResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_applyResponse>(
    withPathParams("/applications/me/{jobId}", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_getMyApplicationsOperation = ApiOperation<
  "/applications/me",
  "get"
>;
export type ApplicantsController_getMyApplicationsRequest =
  ApiRequest<ApplicantsController_getMyApplicationsOperation>;
export type ApplicantsController_getMyApplicationsResponse =
  ApiResponse<ApplicantsController_getMyApplicationsOperation>;
export async function ApplicantsController_getMyApplications(
  request?: ApplicantsController_getMyApplicationsRequest,
): Promise<ApplicantsController_getMyApplicationsResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_getMyApplicationsResponse>(
    withPathParams("/applications/me", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}
type ApplicantsController_getJobApplicationsOperation = ApiOperation<
  "/applications/hr/jobs/{jobId}",
  "get"
>;
export type ApplicantsController_getJobApplicationsRequest =
  ApiRequest<ApplicantsController_getJobApplicationsOperation>;
export type ApplicantsController_getJobApplicationsResponse =
  ApiResponse<ApplicantsController_getJobApplicationsOperation>;
export async function ApplicantsController_getJobApplications(
  request: ApplicantsController_getJobApplicationsRequest,
): Promise<ApplicantsController_getJobApplicationsResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_getJobApplicationsResponse>(
    withPathParams("/applications/hr/jobs/{jobId}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}
// Fallback: Count applications from jobs endpoint
export async function getEmployerCandidateCount(): Promise<number> {
  const jobsResponse = await JobsController_getMyJobs();
  const jobs =
    (jobsResponse as any)?.data ??
    (jobsResponse as any)?.items ??
    jobsResponse ??
    [];

  if (!Array.isArray(jobs)) return 0;

  return jobs.reduce((total, job: any) => {
    const count =
      job.applicationsCount ??
      job.applicantsCount ??
      job.candidates?.length ??
      0;
    return total + (typeof count === "number" ? count : 0);
  }, 0);
}
type ApplicantsController_getApplicationDetailOperation = ApiOperation<
  "/applications/hr/{appId}",
  "get"
>;
export type ApplicantsController_getApplicationDetailRequest =
  ApiRequest<ApplicantsController_getApplicationDetailOperation>;
export type ApplicantsController_getApplicationDetailResponse =
  ApiResponse<ApplicantsController_getApplicationDetailOperation>;
export async function ApplicantsController_getApplicationDetail(
  request: ApplicantsController_getApplicationDetailRequest,
): Promise<ApplicantsController_getApplicationDetailResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_getApplicationDetailResponse>(
    withPathParams("/applications/hr/{appId}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_applyDecisionOperation = ApiOperation<
  "/applications/hr/{appId}/decision",
  "patch"
>;
export type ApplicantsController_applyDecisionRequest =
  ApiRequest<ApplicantsController_applyDecisionOperation>;
export type ApplicantsController_applyDecisionResponse =
  ApiResponse<ApplicantsController_applyDecisionOperation>;
export async function ApplicantsController_applyDecision(
  request: ApplicantsController_applyDecisionRequest,
): Promise<ApplicantsController_applyDecisionResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_applyDecisionResponse>(
    withPathParams("/applications/hr/{appId}/decision", parts.path),
    {
      method: "PATCH",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_getScorecardOperation = ApiOperation<
  "/applications/hr/{appId}/scorecard",
  "get"
>;
export type ApplicantsController_getScorecardRequest =
  ApiRequest<ApplicantsController_getScorecardOperation>;
export type ApplicantsController_getScorecardResponse =
  ApiResponse<ApplicantsController_getScorecardOperation>;
export async function ApplicantsController_getScorecard(
  request: ApplicantsController_getScorecardRequest,
): Promise<ApplicantsController_getScorecardResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_getScorecardResponse>(
    withPathParams("/applications/hr/{appId}/scorecard", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_advanceApplicationStageOperation = ApiOperation<
  "/applications/hr/{appId}/stage",
  "patch"
>;
export type ApplicantsController_advanceApplicationStageRequest =
  ApiRequest<ApplicantsController_advanceApplicationStageOperation>;
export type ApplicantsController_advanceApplicationStageResponse =
  ApiResponse<ApplicantsController_advanceApplicationStageOperation>;
export async function ApplicantsController_advanceApplicationStage(
  request: ApplicantsController_advanceApplicationStageRequest,
): Promise<ApplicantsController_advanceApplicationStageResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_advanceApplicationStageResponse>(
    withPathParams("/applications/hr/{appId}/stage", parts.path),
    {
      method: "PATCH",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ApplicantsController_getInterviewQuestionsOperation = ApiOperation<
  "/applications/hr/{appId}/interview-questions",
  "get"
>;
export type ApplicantsController_getInterviewQuestionsRequest =
  ApiRequest<ApplicantsController_getInterviewQuestionsOperation>;
export type ApplicantsController_getInterviewQuestionsResponse =
  ApiResponse<ApplicantsController_getInterviewQuestionsOperation>;
export async function ApplicantsController_getInterviewQuestions(
  request: ApplicantsController_getInterviewQuestionsRequest,
): Promise<ApplicantsController_getInterviewQuestionsResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ApplicantsController_getInterviewQuestionsResponse>(
    withPathParams("/applications/hr/{appId}/interview-questions", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ScorecardController_previewOperation = ApiOperation<
  "/api/scorecard/mock/preview",
  "post"
>;
export type ScorecardController_previewRequest =
  ApiRequest<ScorecardController_previewOperation>;
export type ScorecardController_previewResponse =
  ApiResponse<ScorecardController_previewOperation>;
export async function ScorecardController_preview(
  request: ScorecardController_previewRequest,
): Promise<ScorecardController_previewResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ScorecardController_previewResponse>(
    withPathParams("/api/scorecard/mock/preview", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ScorecardController_previewRawOperation = ApiOperation<
  "/api/scorecard/mock/preview/raw",
  "post"
>;
export type ScorecardController_previewRawRequest =
  ApiRequest<ScorecardController_previewRawOperation>;
export type ScorecardController_previewRawResponse =
  ApiResponse<ScorecardController_previewRawOperation>;
export async function ScorecardController_previewRaw(
  request: ScorecardController_previewRawRequest,
): Promise<ScorecardController_previewRawResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ScorecardController_previewRawResponse>(
    withPathParams("/api/scorecard/mock/preview/raw", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ScorecardController_getMyScorecardOperation = ApiOperation<
  "/api/scorecard/me",
  "get"
>;
export type ScorecardController_getMyScorecardRequest =
  ApiRequest<ScorecardController_getMyScorecardOperation>;
export type ScorecardController_getMyScorecardResponse =
  ApiResponse<ScorecardController_getMyScorecardOperation>;
export async function ScorecardController_getMyScorecard(
  request?: ScorecardController_getMyScorecardRequest,
): Promise<ScorecardController_getMyScorecardResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ScorecardController_getMyScorecardResponse>(
    withPathParams("/api/scorecard/me", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ScorecardController_getPublicScorecardOperation = ApiOperation<
  "/api/scorecard/{username}",
  "get"
>;
export type ScorecardController_getPublicScorecardRequest =
  ApiRequest<ScorecardController_getPublicScorecardOperation>;
export type ScorecardController_getPublicScorecardResponse =
  ApiResponse<ScorecardController_getPublicScorecardOperation>;
export async function ScorecardController_getPublicScorecard(
  request: ScorecardController_getPublicScorecardRequest,
): Promise<ScorecardController_getPublicScorecardResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ScorecardController_getPublicScorecardResponse>(
    withPathParams("/api/scorecard/{username}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

/**
 * Fetch a public scorecard by GitHub username with no auth.
 * This is the only unauthenticated API call in the app.
 */
export async function getPublicScorecard(
  username: string,
): Promise<ScorecardController_getPublicScorecardResponse | null> {
  try {
    console.log("username: ", username);
    return await apiFetch<ScorecardController_getPublicScorecardResponse>(
      `/api/scorecard/user/${username}`,
      { method: "GET", skipAuth: true },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return null;
  }
}

type ScorecardController_getMyScorecardRawOperation = ApiOperation<
  "/api/scorecard/me/raw",
  "get"
>;
export type ScorecardController_getMyScorecardRawRequest =
  ApiRequest<ScorecardController_getMyScorecardRawOperation>;
export type ScorecardController_getMyScorecardRawResponse =
  ApiResponse<ScorecardController_getMyScorecardRawOperation>;
export async function ScorecardController_getMyScorecardRaw(
  request?: ScorecardController_getMyScorecardRawRequest,
): Promise<ScorecardController_getMyScorecardRawResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ScorecardController_getMyScorecardRawResponse>(
    withPathParams("/api/scorecard/me/raw", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ScorecardController_getPublicScorecardRawOperation = ApiOperation<
  "/api/scorecard/{username}/raw",
  "get"
>;
export type ScorecardController_getPublicScorecardRawRequest =
  ApiRequest<ScorecardController_getPublicScorecardRawOperation>;
export type ScorecardController_getPublicScorecardRawResponse =
  ApiResponse<ScorecardController_getPublicScorecardRawOperation>;
export async function ScorecardController_getPublicScorecardRaw(
  request: ScorecardController_getPublicScorecardRawRequest,
): Promise<ScorecardController_getPublicScorecardRawResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ScorecardController_getPublicScorecardRawResponse>(
    withPathParams("/api/scorecard/{username}/raw", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type MockController_getWalletOperation = ApiOperation<
  "/api/mock/analysis/wallet",
  "get"
>;
export type MockController_getWalletRequest =
  ApiRequest<MockController_getWalletOperation>;
export type MockController_getWalletResponse =
  ApiResponse<MockController_getWalletOperation>;
export async function MockController_getWallet(
  request?: MockController_getWalletRequest,
): Promise<MockController_getWalletResponse> {
  const parts = getRequestParts(request);
  return apiFetch<MockController_getWalletResponse>(
    withPathParams("/api/mock/analysis/wallet", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type MockController_getGithubOnlyOperation = ApiOperation<
  "/api/mock/analysis/github-only",
  "get"
>;
export type MockController_getGithubOnlyRequest =
  ApiRequest<MockController_getGithubOnlyOperation>;
export type MockController_getGithubOnlyResponse =
  ApiResponse<MockController_getGithubOnlyOperation>;
export async function MockController_getGithubOnly(
  request?: MockController_getGithubOnlyRequest,
): Promise<MockController_getGithubOnlyResponse> {
  const parts = getRequestParts(request);
  return apiFetch<MockController_getGithubOnlyResponse>(
    withPathParams("/api/mock/analysis/github-only", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type MockController_getWalletOnlyOperation = ApiOperation<
  "/api/mock/analysis/wallet-only",
  "get"
>;
export type MockController_getWalletOnlyRequest =
  ApiRequest<MockController_getWalletOnlyOperation>;
export type MockController_getWalletOnlyResponse =
  ApiResponse<MockController_getWalletOnlyOperation>;
export async function MockController_getWalletOnly(
  request?: MockController_getWalletOnlyRequest,
): Promise<MockController_getWalletOnlyResponse> {
  const parts = getRequestParts(request);
  return apiFetch<MockController_getWalletOnlyResponse>(
    withPathParams("/api/mock/analysis/wallet-only", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type MockController_getAllOperation = ApiOperation<"/api/mock/analysis", "get">;
export type MockController_getAllRequest =
  ApiRequest<MockController_getAllOperation>;
export type MockController_getAllResponse =
  ApiResponse<MockController_getAllOperation>;
export async function MockController_getAll(
  request?: MockController_getAllRequest,
): Promise<MockController_getAllResponse> {
  const parts = getRequestParts(request);
  return apiFetch<MockController_getAllResponse>(
    withPathParams("/api/mock/analysis", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type MockController_getViewerOperation = ApiOperation<
  "/api/mock/viewer",
  "get"
>;
export type MockController_getViewerRequest =
  ApiRequest<MockController_getViewerOperation>;
export type MockController_getViewerResponse =
  ApiResponse<MockController_getViewerOperation>;
export async function MockController_getViewer(
  request?: MockController_getViewerRequest,
): Promise<MockController_getViewerResponse> {
  const parts = getRequestParts(request);
  return apiFetch<MockController_getViewerResponse>(
    withPathParams("/api/mock/viewer", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AnalysisController_createAnalysisOperation = ApiOperation<
  "/api/analysis",
  "post"
>;
export type AnalysisController_createAnalysisRequest =
  ApiRequest<AnalysisController_createAnalysisOperation>;
export type AnalysisController_createAnalysisResponse =
  ApiResponse<AnalysisController_createAnalysisOperation>;
export async function AnalysisController_createAnalysis(
  request?: AnalysisController_createAnalysisRequest,
): Promise<AnalysisController_createAnalysisResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AnalysisController_createAnalysisResponse>(
    withPathParams("/api/analysis", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AnalysisController_recomputeOperation = ApiOperation<
  "/api/analysis/recompute",
  "post"
>;
export type AnalysisController_recomputeRequest =
  ApiRequest<AnalysisController_recomputeOperation>;
export type AnalysisController_recomputeResponse =
  ApiResponse<AnalysisController_recomputeOperation>;
export async function AnalysisController_recompute(
  request: AnalysisController_recomputeRequest,
): Promise<AnalysisController_recomputeResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AnalysisController_recomputeResponse>(
    withPathParams("/api/analysis/recompute", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AnalysisController_getStatusOperation = ApiOperation<
  "/api/analysis/{jobId}/status",
  "get"
>;
export type AnalysisController_getStatusRequest =
  ApiRequest<AnalysisController_getStatusOperation>;
export type AnalysisController_getStatusResponse =
  ApiResponse<AnalysisController_getStatusOperation>;
export async function AnalysisController_getStatus(
  request: AnalysisController_getStatusRequest,
): Promise<AnalysisController_getStatusResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AnalysisController_getStatusResponse>(
    withPathParams("/api/analysis/{jobId}/status", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AnalysisController_getResultOperation = ApiOperation<
  "/api/analysis/{jobId}/result",
  "get"
>;
export type AnalysisController_getResultRequest =
  ApiRequest<AnalysisController_getResultOperation>;
export type AnalysisController_getResultResponse =
  ApiResponse<AnalysisController_getResultOperation>;
export async function AnalysisController_getResult(
  request: AnalysisController_getResultRequest,
): Promise<AnalysisController_getResultResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AnalysisController_getResultResponse>(
    withPathParams("/api/analysis/{jobId}/result", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type GithubSyncController_startConnectOperation = ApiOperation<
  "/sync/github/connect",
  "get"
>;
export type GithubSyncController_startConnectRequest =
  ApiRequest<GithubSyncController_startConnectOperation>;
export type GithubSyncController_startConnectResponse =
  ApiResponse<GithubSyncController_startConnectOperation>;
export async function GithubSyncController_startConnect(
  request?: GithubSyncController_startConnectRequest,
): Promise<GithubSyncController_startConnectResponse> {
  const parts = getRequestParts(request);
  return apiFetch<GithubSyncController_startConnectResponse>(
    withPathParams("/sync/github/connect", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type GithubSyncController_connectCallbackOperation = ApiOperation<
  "/sync/github/connect/callback",
  "get"
>;
export type GithubSyncController_connectCallbackRequest =
  ApiRequest<GithubSyncController_connectCallbackOperation>;
export type GithubSyncController_connectCallbackResponse =
  ApiResponse<GithubSyncController_connectCallbackOperation>;
export async function GithubSyncController_connectCallback(
  request?: GithubSyncController_connectCallbackRequest,
): Promise<GithubSyncController_connectCallbackResponse> {
  const parts = getRequestParts(request);
  return apiFetch<GithubSyncController_connectCallbackResponse>(
    withPathParams("/sync/github/connect/callback", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type GithubSyncController_triggerSyncOperation = ApiOperation<
  "/sync/github",
  "post"
>;
export type GithubSyncController_triggerSyncRequest =
  ApiRequest<GithubSyncController_triggerSyncOperation>;
export type GithubSyncController_triggerSyncResponse =
  ApiResponse<GithubSyncController_triggerSyncOperation>;
export async function GithubSyncController_triggerSync(
  request?: GithubSyncController_triggerSyncRequest,
): Promise<GithubSyncController_triggerSyncResponse> {
  // console.log("post github sync!");
  const parts = getRequestParts(request);
  return apiFetch<GithubSyncController_triggerSyncResponse>(
    withPathParams("/sync/github", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type GithubSyncController_getSyncStatusOperation = ApiOperation<
  "/sync/github/status",
  "get"
>;
export type GithubSyncController_getSyncStatusRequest =
  ApiRequest<GithubSyncController_getSyncStatusOperation>;
export type GithubSyncController_getSyncStatusResponse =
  ApiResponse<GithubSyncController_getSyncStatusOperation>;
export async function GithubSyncController_getSyncStatus(
  request?: GithubSyncController_getSyncStatusRequest,
): Promise<GithubSyncController_getSyncStatusResponse> {
  const parts = getRequestParts(request);
  return apiFetch<GithubSyncController_getSyncStatusResponse>(
    withPathParams("/sync/github/status", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type JobsController_getPublicJobsOperation = ApiOperation<"/jobs", "get">;
export type JobsController_getPublicJobsRequest =
  ApiRequest<JobsController_getPublicJobsOperation>;
export type JobsController_getPublicJobsResponse =
  ApiResponse<JobsController_getPublicJobsOperation>;
export async function JobsController_getPublicJobs(
  request?: JobsController_getPublicJobsRequest,
): Promise<JobsController_getPublicJobsResponse> {
  const parts = getRequestParts(request);
  return apiFetch<JobsController_getPublicJobsResponse>(
    withPathParams("/jobs", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
      skipAuth: true,
    },
  );
}

type JobsController_getMyJobsOperation = ApiOperation<"/jobs/me", "get">;
export type JobsController_getMyJobsRequest =
  ApiRequest<JobsController_getMyJobsOperation>;
export type JobsController_getMyJobsResponse =
  ApiResponse<JobsController_getMyJobsOperation>;
export async function JobsController_getMyJobs(
  request?: JobsController_getMyJobsRequest & {
    query?: { status?: "draft" | "active" | "all" };
  },
): Promise<JobsController_getMyJobsResponse> {
  const parts = getRequestParts(request);
  return apiFetch<JobsController_getMyJobsResponse>(
    withPathParams("/jobs/me", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type JobsController_getPublicJobByIdOperation = ApiOperation<
  "/jobs/{id}",
  "get"
>;
export type JobsController_getPublicJobByIdRequest =
  ApiRequest<JobsController_getPublicJobByIdOperation>;
export type JobsController_getPublicJobByIdResponse =
  ApiResponse<JobsController_getPublicJobByIdOperation>;
export async function JobsController_getPublicJobById(
  request: JobsController_getPublicJobByIdRequest,
): Promise<JobsController_getPublicJobByIdResponse> {
  const parts = getRequestParts(request);
  if (!isValidJobPostPathId(parts.path?.id as string | undefined)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return apiFetch<JobsController_getPublicJobByIdResponse>(
    withPathParams("/jobs/{id}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type JobsController_createOperation = ApiOperation<"/jobs/draft", "post">;
export type JobsController_createRequest =
  ApiRequest<JobsController_createOperation>;
export type JobsController_createResponse =
  ApiResponse<JobsController_createOperation>;

export async function JobsController_create(
  request: JobsController_createRequest,
): Promise<JobsController_createResponse> {
  const parts = getRequestParts(request);
  return apiFetch<JobsController_createResponse>(
    withPathParams("/jobs/draft", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

/** Canonical create endpoint: `POST /jobs` (same payload as `/jobs/draft`). */
export async function JobsController_createJobPost(
  request: JobsController_createRequest,
): Promise<JobsController_createResponse> {
  const parts = getRequestParts(request);
  return apiFetch<JobsController_createResponse>("/jobs", {
    method: "POST",
    query: parts.query,
    headers: parts.headers,
    body: parts.body,
  });
}

type JobsController_parseJdOperation = ApiOperation<
  "/jobs/{id}/parse-jd",
  "post"
>;
export type JobsController_parseJdRequest =
  ApiRequest<JobsController_parseJdOperation>;
export type JobsController_parseJdResponse =
  ApiResponse<JobsController_parseJdOperation>;
export async function JobsController_parseJd(
  request: JobsController_parseJdRequest,
): Promise<JobsController_parseJdResponse> {
  const parts = getRequestParts(request);
  if (!isValidJobPostPathId(parts.path?.id as string | undefined)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return apiFetch<JobsController_parseJdResponse>(
    withPathParams("/jobs/{id}/parse-jd", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type JobsController_confirmRequirementsOperation = ApiOperation<
  "/jobs/{id}/confirm-requirements",
  "post"
>;
export type JobsController_confirmRequirementsRequest =
  ApiRequest<JobsController_confirmRequirementsOperation>;
export type JobsController_confirmRequirementsResponse =
  ApiResponse<JobsController_confirmRequirementsOperation>;
export async function JobsController_confirmRequirements(
  request: JobsController_confirmRequirementsRequest,
): Promise<JobsController_confirmRequirementsResponse> {
  const parts = getRequestParts(request);
  if (!isValidJobPostPathId(parts.path?.id as string | undefined)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return apiFetch<JobsController_confirmRequirementsResponse>(
    withPathParams("/jobs/{id}/confirm-requirements", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type JobsController_publishOperation = ApiOperation<
  "/jobs/{id}/publish",
  "post"
>;
export type JobsController_publishRequest =
  ApiRequest<JobsController_publishOperation>;
export type JobsController_publishResponse =
  ApiResponse<JobsController_publishOperation>;
export async function JobsController_publish(
  request: JobsController_publishRequest,
): Promise<JobsController_publishResponse> {
  const parts = getRequestParts(request);
  if (!isValidJobPostPathId(parts.path?.id as string | undefined)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return apiFetch<JobsController_publishResponse>(
    withPathParams("/jobs/{id}/publish", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

export async function JobsController_publishPatch(
  request: JobsController_publishRequest,
): Promise<JobsController_publishResponse> {
  const parts = getRequestParts(request);
  if (!isValidJobPostPathId(parts.path?.id as string | undefined)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return apiFetch<JobsController_publishResponse>(
    withPathParams("/jobs/{id}/publish", parts.path),
    {
      method: "PATCH",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type JobsController_closeOperation = ApiOperation<"/jobs/{id}/close", "post">;
export type JobsController_closeRequest =
  ApiRequest<JobsController_closeOperation>;
export type JobsController_closeResponse =
  ApiResponse<JobsController_closeOperation>;
export async function JobsController_close(
  request: JobsController_closeRequest,
): Promise<JobsController_closeResponse> {
  const parts = getRequestParts(request);
  if (!isValidJobPostPathId(parts.path?.id as string | undefined)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return apiFetch<JobsController_closeResponse>(
    withPathParams("/jobs/{id}/close", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthEmployerController_loginOperation = ApiOperation<
  "/auth/employer/login",
  "post"
>;
export type AuthEmployerController_loginRequest =
  ApiRequest<AuthEmployerController_loginOperation>;
export type AuthEmployerController_loginResponse =
  ApiResponse<AuthEmployerController_loginOperation>;
export async function AuthEmployerController_login(
  request: AuthEmployerController_loginRequest,
): Promise<AuthEmployerController_loginResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthEmployerController_loginResponse>(
    withPathParams("/auth/employer/login", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthEmployerController_logoutOperation = ApiOperation<
  "/auth/employer/logout",
  "post"
>;
export type AuthEmployerController_logoutRequest =
  ApiRequest<AuthEmployerController_logoutOperation>;
export type AuthEmployerController_logoutResponse =
  ApiResponse<AuthEmployerController_logoutOperation>;
export async function AuthEmployerController_logout(
  request?: AuthEmployerController_logoutRequest,
): Promise<AuthEmployerController_logoutResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthEmployerController_logoutResponse>(
    withPathParams("/auth/employer/logout", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_registerOperation = ApiOperation<
  "/auth/candidate/register",
  "post"
>;
export type AuthCandidateController_registerRequest =
  ApiRequest<AuthCandidateController_registerOperation>;
export type AuthCandidateController_registerResponse =
  ApiResponse<AuthCandidateController_registerOperation>;
export async function AuthCandidateController_register(
  request: AuthCandidateController_registerRequest,
): Promise<AuthCandidateController_registerResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_registerResponse>(
    withPathParams("/auth/candidate/register", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_verifyEmailOperation = ApiOperation<
  "/auth/candidate/verify-email",
  "post"
>;
export type AuthCandidateController_verifyEmailRequest =
  ApiRequest<AuthCandidateController_verifyEmailOperation>;
export type AuthCandidateController_verifyEmailResponse =
  ApiResponse<AuthCandidateController_verifyEmailOperation>;
export async function AuthCandidateController_verifyEmail(
  request: AuthCandidateController_verifyEmailRequest,
): Promise<AuthCandidateController_verifyEmailResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_verifyEmailResponse>(
    withPathParams("/auth/candidate/verify-email", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_loginOperation = ApiOperation<
  "/auth/candidate/login",
  "post"
>;
export type AuthCandidateController_loginRequest =
  ApiRequest<AuthCandidateController_loginOperation>;
export type AuthCandidateController_loginResponse =
  ApiResponse<AuthCandidateController_loginOperation>;
export async function AuthCandidateController_login(
  request: AuthCandidateController_loginRequest,
): Promise<AuthCandidateController_loginResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_loginResponse>(
    withPathParams("/auth/candidate/login", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_logoutOperation = ApiOperation<
  "/auth/candidate/logout",
  "post"
>;
export type AuthCandidateController_logoutRequest =
  ApiRequest<AuthCandidateController_logoutOperation>;
export type AuthCandidateController_logoutResponse =
  ApiResponse<AuthCandidateController_logoutOperation>;
export async function AuthCandidateController_logout(
  request?: AuthCandidateController_logoutRequest,
): Promise<AuthCandidateController_logoutResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_logoutResponse>(
    withPathParams("/auth/candidate/logout", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_githubLoginOperation = ApiOperation<
  "/auth/candidate/github",
  "get"
>;
export type AuthCandidateController_githubLoginRequest =
  ApiRequest<AuthCandidateController_githubLoginOperation>;
export type AuthCandidateController_githubLoginResponse =
  ApiResponse<AuthCandidateController_githubLoginOperation>;
export async function AuthCandidateController_githubLogin(
  request?: AuthCandidateController_githubLoginRequest,
): Promise<AuthCandidateController_githubLoginResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_githubLoginResponse>(
    withPathParams("/auth/candidate/github", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_githubCallbackOperation = ApiOperation<
  "/auth/candidate/github/callback",
  "get"
>;
export type AuthCandidateController_githubCallbackRequest =
  ApiRequest<AuthCandidateController_githubCallbackOperation>;
export type AuthCandidateController_githubCallbackResponse =
  ApiResponse<AuthCandidateController_githubCallbackOperation>;
export async function AuthCandidateController_githubCallback(
  request?: AuthCandidateController_githubCallbackRequest,
): Promise<AuthCandidateController_githubCallbackResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_githubCallbackResponse>(
    withPathParams("/auth/candidate/github/callback", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_googleLoginOperation = ApiOperation<
  "/auth/candidate/google",
  "get"
>;
export type AuthCandidateController_googleLoginRequest =
  ApiRequest<AuthCandidateController_googleLoginOperation>;
export type AuthCandidateController_googleLoginResponse =
  ApiResponse<AuthCandidateController_googleLoginOperation>;
export async function AuthCandidateController_googleLogin(
  request?: AuthCandidateController_googleLoginRequest,
): Promise<AuthCandidateController_googleLoginResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_googleLoginResponse>(
    withPathParams("/auth/candidate/google", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_googleCallbackOperation = ApiOperation<
  "/auth/candidate/google/callback",
  "get"
>;
export type AuthCandidateController_googleCallbackRequest =
  ApiRequest<AuthCandidateController_googleCallbackOperation>;
export type AuthCandidateController_googleCallbackResponse =
  ApiResponse<AuthCandidateController_googleCallbackOperation>;
export async function AuthCandidateController_googleCallback(
  request?: AuthCandidateController_googleCallbackRequest,
): Promise<AuthCandidateController_googleCallbackResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_googleCallbackResponse>(
    withPathParams("/auth/candidate/google/callback", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_completeOnboardingOperation = ApiOperation<
  "/auth/candidate/onboarding",
  "post"
>;
export type AuthCandidateController_completeOnboardingRequest =
  ApiRequest<AuthCandidateController_completeOnboardingOperation>;
export type AuthCandidateController_completeOnboardingResponse =
  ApiResponse<AuthCandidateController_completeOnboardingOperation>;
export async function AuthCandidateController_completeOnboarding(
  request: AuthCandidateController_completeOnboardingRequest,
): Promise<AuthCandidateController_completeOnboardingResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_completeOnboardingResponse>(
    withPathParams("/auth/candidate/onboarding", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_linkGithubOperation = ApiOperation<
  "/auth/candidate/github/link",
  "get"
>;
export type AuthCandidateController_linkGithubRequest =
  ApiRequest<AuthCandidateController_linkGithubOperation>;
export type AuthCandidateController_linkGithubResponse =
  ApiResponse<AuthCandidateController_linkGithubOperation>;
export async function AuthCandidateController_linkGithub(
  request?: AuthCandidateController_linkGithubRequest,
): Promise<AuthCandidateController_linkGithubResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_linkGithubResponse>(
    withPathParams("/auth/candidate/github/link", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_linkGithubCallbackOperation = ApiOperation<
  "/auth/candidate/github/link/callback",
  "get"
>;
export type AuthCandidateController_linkGithubCallbackRequest =
  ApiRequest<AuthCandidateController_linkGithubCallbackOperation>;
export type AuthCandidateController_linkGithubCallbackResponse =
  ApiResponse<AuthCandidateController_linkGithubCallbackOperation>;
export async function AuthCandidateController_linkGithubCallback(
  request?: AuthCandidateController_linkGithubCallbackRequest,
): Promise<AuthCandidateController_linkGithubCallbackResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_linkGithubCallbackResponse>(
    withPathParams("/auth/candidate/github/link/callback", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_linkGoogleOperation = ApiOperation<
  "/auth/candidate/google/link",
  "get"
>;
export type AuthCandidateController_linkGoogleRequest =
  ApiRequest<AuthCandidateController_linkGoogleOperation>;
export type AuthCandidateController_linkGoogleResponse =
  ApiResponse<AuthCandidateController_linkGoogleOperation>;
export async function AuthCandidateController_linkGoogle(
  request?: AuthCandidateController_linkGoogleRequest,
): Promise<AuthCandidateController_linkGoogleResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_linkGoogleResponse>(
    withPathParams("/auth/candidate/google/link", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_linkGoogleCallbackOperation = ApiOperation<
  "/auth/candidate/google/link/callback",
  "get"
>;
export type AuthCandidateController_linkGoogleCallbackRequest =
  ApiRequest<AuthCandidateController_linkGoogleCallbackOperation>;
export type AuthCandidateController_linkGoogleCallbackResponse =
  ApiResponse<AuthCandidateController_linkGoogleCallbackOperation>;
export async function AuthCandidateController_linkGoogleCallback(
  request?: AuthCandidateController_linkGoogleCallbackRequest,
): Promise<AuthCandidateController_linkGoogleCallbackResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_linkGoogleCallbackResponse>(
    withPathParams("/auth/candidate/google/link/callback", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_refreshOperation = ApiOperation<
  "/auth/candidate/refresh",
  "post"
>;
export type AuthCandidateController_refreshRequest =
  ApiRequest<AuthCandidateController_refreshOperation>;
export type AuthCandidateController_refreshResponse =
  ApiResponse<AuthCandidateController_refreshOperation>;
export async function AuthCandidateController_refresh(
  request?: AuthCandidateController_refreshRequest,
): Promise<AuthCandidateController_refreshResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_refreshResponse>(
    withPathParams("/auth/candidate/refresh", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_requestPasswordResetOperation = ApiOperation<
  "/auth/candidate/password-reset/request",
  "post"
>;
export type AuthCandidateController_requestPasswordResetRequest =
  ApiRequest<AuthCandidateController_requestPasswordResetOperation>;
export type AuthCandidateController_requestPasswordResetResponse =
  ApiResponse<AuthCandidateController_requestPasswordResetOperation>;
export async function AuthCandidateController_requestPasswordReset(
  request: AuthCandidateController_requestPasswordResetRequest,
): Promise<AuthCandidateController_requestPasswordResetResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_requestPasswordResetResponse>(
    withPathParams("/auth/candidate/password-reset/request", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_resetPasswordOperation = ApiOperation<
  "/auth/candidate/password-reset/confirm",
  "post"
>;
export type AuthCandidateController_resetPasswordRequest =
  ApiRequest<AuthCandidateController_resetPasswordOperation>;
export type AuthCandidateController_resetPasswordResponse =
  ApiResponse<AuthCandidateController_resetPasswordOperation>;
export async function AuthCandidateController_resetPassword(
  request: AuthCandidateController_resetPasswordRequest,
): Promise<AuthCandidateController_resetPasswordResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_resetPasswordResponse>(
    withPathParams("/auth/candidate/password-reset/confirm", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_setupMfaOperation = ApiOperation<
  "/auth/candidate/mfa/setup",
  "get"
>;
export type AuthCandidateController_setupMfaRequest =
  ApiRequest<AuthCandidateController_setupMfaOperation>;
export type AuthCandidateController_setupMfaResponse =
  ApiResponse<AuthCandidateController_setupMfaOperation>;
export async function AuthCandidateController_setupMfa(
  request?: AuthCandidateController_setupMfaRequest,
): Promise<AuthCandidateController_setupMfaResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_setupMfaResponse>(
    withPathParams("/auth/candidate/mfa/setup", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_activateMfaOperation = ApiOperation<
  "/auth/candidate/mfa/activate",
  "post"
>;
export type AuthCandidateController_activateMfaRequest =
  ApiRequest<AuthCandidateController_activateMfaOperation>;
export type AuthCandidateController_activateMfaResponse =
  ApiResponse<AuthCandidateController_activateMfaOperation>;
export async function AuthCandidateController_activateMfa(
  request: AuthCandidateController_activateMfaRequest,
): Promise<AuthCandidateController_activateMfaResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_activateMfaResponse>(
    withPathParams("/auth/candidate/mfa/activate", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_verifyMfaOperation = ApiOperation<
  "/auth/candidate/mfa/verify",
  "post"
>;
export type AuthCandidateController_verifyMfaRequest =
  ApiRequest<AuthCandidateController_verifyMfaOperation>;
export type AuthCandidateController_verifyMfaResponse =
  ApiResponse<AuthCandidateController_verifyMfaOperation>;
export async function AuthCandidateController_verifyMfa(
  request: AuthCandidateController_verifyMfaRequest,
): Promise<AuthCandidateController_verifyMfaResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_verifyMfaResponse>(
    withPathParams("/auth/candidate/mfa/verify", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type AuthCandidateController_verifyMfaRecoveryOperation = ApiOperation<
  "/auth/candidate/mfa/verify-recovery",
  "post"
>;
export type AuthCandidateController_verifyMfaRecoveryRequest =
  ApiRequest<AuthCandidateController_verifyMfaRecoveryOperation>;
export type AuthCandidateController_verifyMfaRecoveryResponse =
  ApiResponse<AuthCandidateController_verifyMfaRecoveryOperation>;
export async function AuthCandidateController_verifyMfaRecovery(
  request: AuthCandidateController_verifyMfaRecoveryRequest,
): Promise<AuthCandidateController_verifyMfaRecoveryResponse> {
  const parts = getRequestParts(request);
  return apiFetch<AuthCandidateController_verifyMfaRecoveryResponse>(
    withPathParams("/auth/candidate/mfa/verify-recovery", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type CompaniesController_getMeOperation = ApiOperation<"/me/company", "get">;
export type CompaniesController_getMeRequest =
  ApiRequest<CompaniesController_getMeOperation>;
export type CompaniesController_getMeResponse =
  ApiResponse<CompaniesController_getMeOperation>;
export async function CompaniesController_getMe(
  request?: CompaniesController_getMeRequest,
): Promise<CompaniesController_getMeResponse> {
  const parts = getRequestParts(request);
  return apiFetch<CompaniesController_getMeResponse>(
    withPathParams("/me/company", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type HealthController_checkOperation = ApiOperation<"/health", "get">;
export type HealthController_checkRequest =
  ApiRequest<HealthController_checkOperation>;
export type HealthController_checkResponse =
  ApiResponse<HealthController_checkOperation>;
export async function HealthController_check(
  request?: HealthController_checkRequest,
): Promise<HealthController_checkResponse> {
  const parts = getRequestParts(request);
  return apiFetch<HealthController_checkResponse>(
    withPathParams("/health", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ProfileController_getProfileOperation = ApiOperation<"/me/user", "get">;
export type ProfileController_getProfileRequest =
  ApiRequest<ProfileController_getProfileOperation>;
export type ProfileController_getProfileResponse =
  ApiResponse<ProfileController_getProfileOperation>;
export async function ProfileController_getProfile(
  request?: ProfileController_getProfileRequest,
): Promise<ProfileController_getProfileResponse> {
  // console.log("getting profile in frontend");
  const parts = getRequestParts(request);
  return apiFetch<ProfileController_getProfileResponse>(
    withPathParams("/me/user", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type PublicProfile = {
  username: string;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  careerPath?: number;
};

type ProfileController_updateProfileOperation = ApiOperation<
  "/me/user",
  "patch"
>;
export type ProfileController_updateProfileRequest =
  ApiRequest<ProfileController_updateProfileOperation>;
export type ProfileController_updateProfileResponse =
  ApiResponse<ProfileController_updateProfileOperation>;
export async function ProfileController_updateProfile(
  request: ProfileController_updateProfileRequest,
): Promise<ProfileController_updateProfileResponse> {
  // console.log("profile update frontned");

  const parts = getRequestParts(request);
  // console.log("query: ", parts.query);
  return apiFetch<ProfileController_updateProfileResponse>(
    withPathParams("/me/user", parts.path),
    {
      method: "PATCH",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ProfileController_deactivateAccountOperation = ApiOperation<
  "/me/user",
  "delete"
>;
export type ProfileController_deactivateAccountRequest =
  ApiRequest<ProfileController_deactivateAccountOperation>;
export type ProfileController_deactivateAccountResponse =
  ApiResponse<ProfileController_deactivateAccountOperation>;
export async function ProfileController_deactivateAccount(
  request?: ProfileController_deactivateAccountRequest,
): Promise<ProfileController_deactivateAccountResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ProfileController_deactivateAccountResponse>(
    withPathParams("/me/user", parts.path),
    {
      method: "DELETE",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ProfileController_getCandidateProfileOperation = ApiOperation<
  "/me/user/candidate",
  "get"
>;
export type ProfileController_getCandidateProfileRequest =
  ApiRequest<ProfileController_getCandidateProfileOperation>;
export type ProfileController_getCandidateProfileResponse =
  ApiResponse<ProfileController_getCandidateProfileOperation>;
export async function ProfileController_getCandidateProfile(
  request?: ProfileController_getCandidateProfileRequest,
): Promise<ProfileController_getCandidateProfileResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ProfileController_getCandidateProfileResponse>(
    withPathParams("/me/user/candidate", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ProfileController_updateCandidateProfileOperation = ApiOperation<
  "/me/user/candidate",
  "patch"
>;
export type ProfileController_updateCandidateProfileRequest =
  ApiRequest<ProfileController_updateCandidateProfileOperation>;
export type ProfileController_updateCandidateProfileResponse =
  ApiResponse<ProfileController_updateCandidateProfileOperation>;
export async function ProfileController_updateCandidateProfile(
  request: ProfileController_updateCandidateProfileRequest,
): Promise<ProfileController_updateCandidateProfileResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ProfileController_updateCandidateProfileResponse>(
    withPathParams("/me/user/candidate", parts.path),
    {
      method: "PATCH",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ProfileController_getConnectedGithubOperation = ApiOperation<
  "/me/user/github",
  "get"
>;
export type ProfileController_getConnectedGithubRequest =
  ApiRequest<ProfileController_getConnectedGithubOperation>;
export type ProfileController_getConnectedGithubResponse =
  ApiResponse<ProfileController_getConnectedGithubOperation>;
export async function ProfileController_getConnectedGithub(
  request?: ProfileController_getConnectedGithubRequest,
): Promise<ProfileController_getConnectedGithubResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ProfileController_getConnectedGithubResponse>(
    withPathParams("/me/user/github", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ProfileController_getConnectedWalletOperation = ApiOperation<
  "/me/user/wallet",
  "get"
>;
export type ProfileController_getConnectedWalletRequest =
  ApiRequest<ProfileController_getConnectedWalletOperation>;
export type ProfileController_getConnectedWalletResponse =
  ApiResponse<ProfileController_getConnectedWalletOperation>;
export async function ProfileController_getConnectedWallet(
  request?: ProfileController_getConnectedWalletRequest,
): Promise<ProfileController_getConnectedWalletResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ProfileController_getConnectedWalletResponse>(
    withPathParams("/me/user/wallet", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type VouchesController_confirmVouchOperation = ApiOperation<
  "/vouch/confirm",
  "post"
>;
export type VouchesController_confirmVouchRequest =
  ApiRequest<VouchesController_confirmVouchOperation>;
export type VouchesController_confirmVouchResponse =
  ApiResponse<VouchesController_confirmVouchOperation>;
export async function VouchesController_confirmVouch(
  request: VouchesController_confirmVouchRequest,
): Promise<VouchesController_confirmVouchResponse> {
  const parts = getRequestParts(request);
  return apiFetch<VouchesController_confirmVouchResponse>(
    withPathParams("/vouch/confirm", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type VouchesController_revokeVouchOperation = ApiOperation<
  "/vouch/{id}",
  "delete"
>;
export type VouchesController_revokeVouchRequest =
  ApiRequest<VouchesController_revokeVouchOperation>;
export type VouchesController_revokeVouchResponse =
  ApiResponse<VouchesController_revokeVouchOperation>;
export async function VouchesController_revokeVouch(
  request: VouchesController_revokeVouchRequest,
): Promise<VouchesController_revokeVouchResponse> {
  const parts = getRequestParts(request);
  return apiFetch<VouchesController_revokeVouchResponse>(
    withPathParams("/vouch/{id}", parts.path),
    {
      method: "DELETE",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type VouchesController_heliusWebhookOperation = ApiOperation<
  "/vouch/webhooks/helius",
  "post"
>;
export type VouchesController_heliusWebhookRequest =
  ApiRequest<VouchesController_heliusWebhookOperation>;
export type VouchesController_heliusWebhookResponse =
  ApiResponse<VouchesController_heliusWebhookOperation>;
export async function VouchesController_heliusWebhook(
  request: VouchesController_heliusWebhookRequest,
): Promise<VouchesController_heliusWebhookResponse> {
  const parts = getRequestParts(request);
  return apiFetch<VouchesController_heliusWebhookResponse>(
    withPathParams("/vouch/webhooks/helius", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ActionsController_getBlinkCardOperation = ApiOperation<
  "/api/actions/vouch/{username}",
  "get"
>;
export type ActionsController_getBlinkCardRequest =
  ApiRequest<ActionsController_getBlinkCardOperation>;
export type ActionsController_getBlinkCardResponse =
  ApiResponse<ActionsController_getBlinkCardOperation>;
export async function ActionsController_getBlinkCard(
  request: ActionsController_getBlinkCardRequest,
): Promise<ActionsController_getBlinkCardResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ActionsController_getBlinkCardResponse>(
    withPathParams("/api/actions/vouch/{username}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type ActionsController_getBlinkTransactionOperation = ApiOperation<
  "/api/actions/vouch/{username}",
  "post"
>;
export type ActionsController_getBlinkTransactionRequest =
  ApiRequest<ActionsController_getBlinkTransactionOperation>;
export type ActionsController_getBlinkTransactionResponse =
  ApiResponse<ActionsController_getBlinkTransactionOperation>;
export async function ActionsController_getBlinkTransaction(
  request: ActionsController_getBlinkTransactionRequest,
): Promise<ActionsController_getBlinkTransactionResponse> {
  const parts = getRequestParts(request);
  return apiFetch<ActionsController_getBlinkTransactionResponse>(
    withPathParams("/api/actions/vouch/{username}", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type WalletSyncController_getChallengeOperation = ApiOperation<
  "/sync/wallet/challenge",
  "get"
>;
export type WalletSyncController_getChallengeRequest =
  ApiRequest<WalletSyncController_getChallengeOperation>;
export type WalletSyncController_getChallengeResponse =
  ApiResponse<WalletSyncController_getChallengeOperation>;
export async function WalletSyncController_getChallenge(
  request?: WalletSyncController_getChallengeRequest,
): Promise<WalletSyncController_getChallengeResponse> {
  const parts = getRequestParts(request);
  return apiFetch<WalletSyncController_getChallengeResponse>(
    withPathParams("/sync/wallet/challenge", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type WalletSyncController_linkWalletOperation = ApiOperation<
  "/sync/wallet",
  "post"
>;
export type WalletSyncController_linkWalletRequest =
  ApiRequest<WalletSyncController_linkWalletOperation>;
export type WalletSyncController_linkWalletResponse =
  ApiResponse<WalletSyncController_linkWalletOperation>;
export async function WalletSyncController_linkWallet(
  request: WalletSyncController_linkWalletRequest,
): Promise<WalletSyncController_linkWalletResponse> {
  const parts = getRequestParts(request);
  return apiFetch<WalletSyncController_linkWalletResponse>(
    withPathParams("/sync/wallet", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type EscrowController_initParamsOperation = ApiOperation<
  "/escrow/init-params/{jobPostId}",
  "get"
>;
export type EscrowController_initParamsRequest =
  ApiRequest<EscrowController_initParamsOperation>;
export type EscrowController_initParamsResponse =
  ApiResponse<EscrowController_initParamsOperation>;
export async function EscrowController_initParams(
  request: EscrowController_initParamsRequest,
): Promise<EscrowController_initParamsResponse> {
  const parts = getRequestParts(request);
  return apiFetch<EscrowController_initParamsResponse>(
    withPathParams("/escrow/init-params/{jobPostId}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type EscrowController_confirmFundedOperation = ApiOperation<
  "/escrow/confirm-funded",
  "post"
>;
export type EscrowController_confirmFundedRequest =
  ApiRequest<EscrowController_confirmFundedOperation>;
export type EscrowController_confirmFundedResponse =
  ApiResponse<EscrowController_confirmFundedOperation>;
export async function EscrowController_confirmFunded(
  request: EscrowController_confirmFundedRequest,
): Promise<EscrowController_confirmFundedResponse> {
  const parts = getRequestParts(request);
  return apiFetch<EscrowController_confirmFundedResponse>(
    withPathParams("/escrow/confirm-funded", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type EscrowController_setCandidateOperation = ApiOperation<
  "/escrow/set-candidate",
  "post"
>;
export type EscrowController_setCandidateRequest =
  ApiRequest<EscrowController_setCandidateOperation>;
export type EscrowController_setCandidateResponse =
  ApiResponse<EscrowController_setCandidateOperation>;
export async function EscrowController_setCandidate(
  request: EscrowController_setCandidateRequest,
): Promise<EscrowController_setCandidateResponse> {
  const parts = getRequestParts(request);
  return apiFetch<EscrowController_setCandidateResponse>(
    withPathParams("/escrow/set-candidate", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type EscrowController_confirmReleasedOperation = ApiOperation<
  "/escrow/confirm-released",
  "post"
>;
export type EscrowController_confirmReleasedRequest =
  ApiRequest<EscrowController_confirmReleasedOperation>;
export type EscrowController_confirmReleasedResponse =
  ApiResponse<EscrowController_confirmReleasedOperation>;
export async function EscrowController_confirmReleased(
  request: EscrowController_confirmReleasedRequest,
): Promise<EscrowController_confirmReleasedResponse> {
  const parts = getRequestParts(request);
  return apiFetch<EscrowController_confirmReleasedResponse>(
    withPathParams("/escrow/confirm-released", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type EscrowController_confirmRefundedOperation = ApiOperation<
  "/escrow/confirm-refunded",
  "post"
>;
export type EscrowController_confirmRefundedRequest =
  ApiRequest<EscrowController_confirmRefundedOperation>;
export type EscrowController_confirmRefundedResponse =
  ApiResponse<EscrowController_confirmRefundedOperation>;
export async function EscrowController_confirmRefunded(
  request: EscrowController_confirmRefundedRequest,
): Promise<EscrowController_confirmRefundedResponse> {
  const parts = getRequestParts(request);
  return apiFetch<EscrowController_confirmRefundedResponse>(
    withPathParams("/escrow/confirm-refunded", parts.path),
    {
      method: "POST",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

type EscrowController_statusOperation = ApiOperation<
  "/escrow/status/{jobPostId}",
  "get"
>;
export type EscrowController_statusRequest =
  ApiRequest<EscrowController_statusOperation>;
export type EscrowController_statusResponse =
  ApiResponse<EscrowController_statusOperation>;
export async function EscrowController_status(
  request: EscrowController_statusRequest,
): Promise<EscrowController_statusResponse> {
  const parts = getRequestParts(request);
  return apiFetch<EscrowController_statusResponse>(
    withPathParams("/escrow/status/{jobPostId}", parts.path),
    {
      method: "GET",
      query: parts.query,
      headers: parts.headers,
      body: parts.body,
    },
  );
}

// ---------------------------------------------------------------------------
// Custom Convenience Wrappers added for Profile UI
// ---------------------------------------------------------------------------

export const getLinkedGithub = () => ProfileController_getConnectedGithub();
export const getLinkedWallet = () => ProfileController_getConnectedWallet();
export const triggerGithubSync = () => GithubSyncController_triggerSync();
export const startAnalysis = () => AnalysisController_createAnalysis();
export const getAnalysisCooldown = () =>
  apiFetch<{
    github: { cooldownUntil: string | null };
    wallet: { cooldownUntil: string | null };
    generate: { cooldownUntil: string | null };
  }>("/me/user/cooldown");
export const getMe = () => ProfileController_getProfile();
export const getCandidateProfile = () =>
  ProfileController_getCandidateProfile();
export const updateUser = (body: any) =>
  ProfileController_updateProfile({ body });
export const updateCandidateProfile = (body: any) =>
  ProfileController_updateCandidateProfile({ body });

export const getAnalysisStatus = (jobId: string) =>
  AnalysisController_getStatus({ path: { jobId } });
export const getAnalysisResult = (jobId: string) =>
  AnalysisController_getResult({ path: { jobId } });
// export const getMyScorecard = () => ScorecardController_getMyScorecard();
export const getMyRawScorecard = () => ScorecardController_getMyScorecardRaw();
export const getMyScorecard = async () => {
  console.log("fetching");
  try {
    return await ScorecardController_getMyScorecard();
  } catch (err: any) {
    if (err?.status === 404) {
      console.log("got a 404");
      return null; // THIS IS KEY
    }
    throw err;
  }
};

export const getGithubConnectUrl = () => AuthCandidateController_linkGithub();
export const getGithubSyncStatus = () => GithubSyncController_getSyncStatus();
export const getWalletChallenge = () => WalletSyncController_getChallenge();
export const submitWalletSignature = (body: any) =>
  WalletSyncController_linkWallet({ body });
export const getMfaSetup = () => AuthCandidateController_setupMfa();
export const activateMfa = (body: any) =>
  AuthCandidateController_activateMfa({ body });
export const deleteAccount = () => ProfileController_deactivateAccount();

export const getSecurityInfo = (): Promise<{
  mfaEnabled: boolean;
  hasPassword: boolean;
  linkedProviders: string[];
}> => apiFetch("/auth/candidate/me/security");

export const changePassword = (body: {
  currentPassword?: string;
  newPassword: string;
}): Promise<{ success: boolean }> =>
  apiFetch("/auth/candidate/me/change-password", { method: "POST", body });

/** Opens the GitHub OAuth link flow, links GitHub as a login provider */
export const linkGithubAccount = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  window.location.href = `${apiUrl}/auth/candidate/github/link`;
};

/** Opens the Google OAuth link flow, links Google as a login provider */
export const linkGoogleAccount = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  window.location.href = `${apiUrl}/auth/candidate/google/link`;
};

export const getMyApplications = () => ApplicantsController_getMyApplications();

export const listJobs = (params: {
  search?: string;
  roleType?: string;
  seniority?: string;
  isWeb3?: boolean;
  isEscrowFunded?: boolean;
  isVerifiedPayer?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ jobs: any[]; total: number }> =>
  apiFetch("/jobs", { method: "GET", query: params as any, skipAuth: true });

export const getJob = (id: string) =>
  JobsController_getPublicJobById({ path: { id } } as any);
export const getGapPreview = (params: { jobId: string }) => {
  if (!isValidJobPostPathId(params.jobId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return ApplicantsController_getGapPreview({ query: params } as any);
};
export const applyToJob = (jobId: string) => {
  if (!isValidJobPostPathId(jobId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return ApplicantsController_apply({ path: { jobId } } as any);
};

export const initiateVouch = async (
  username: string,
  data: { message?: string },
  account: string,
) => {
  return apiFetch<any>(`/api/actions/vouch/${username}`, {
    method: "POST",
    body: {
      account,
      data: data.message ? { message: data.message } : undefined,
    },
    skipAuth: true,
  });
};

export const confirmVouch = async (data: {
  candidateIdentifier: string;
  message: string;
  txSignature: string;
}) => {
  return (VouchesController_confirmVouch as any)({ body: data });
};

export const confirmEscrowFunded = async (data: {
  jobPostId: string;
  txSignature: string;
}) => {
  if (!isValidJobPostPathId(data.jobPostId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return (EscrowController_confirmFunded as any)({ body: data });
};

export const getEscrowStatus = async (jobPostId: string) => {
  if (!isValidJobPostPathId(jobPostId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return (EscrowController_status as any)({ path: { jobPostId } });
};

export const setEscrowCandidate = async (data: {
  jobPostId: string;
  candidateId: string;
  walletAddress: string;
}) => {
  if (!isValidJobPostPathId(data.jobPostId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return (EscrowController_setCandidate as any)({ body: data });
};

export const confirmEscrowReleased = async (data: { jobPostId: string }) => {
  if (!isValidJobPostPathId(data.jobPostId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return (EscrowController_confirmReleased as any)({ body: data });
};

export const confirmEscrowRefunded = async (data: { jobPostId: string }) => {
  if (!isValidJobPostPathId(data.jobPostId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return (EscrowController_confirmRefunded as any)({ body: data });
};

// ---------------------------------------------------------------------------
// Pipeline & Application Endpoints
// ---------------------------------------------------------------------------
export const getJobApplications = async (jobId: string) => {
  if (!isValidJobPostPathId(jobId)) {
    return Promise.reject(new Error("Invalid job id"));
  }
  return (ApplicantsController_getJobApplications as any)({ path: { jobId } });
};

export const getApplication = async (applicationId: string) => {
  return (ApplicantsController_getApplicationDetail as any)({
    path: { id: applicationId },
  });
};

export const getApplicationScorecard = async (applicationId: string) => {
  return (ApplicantsController_getScorecard as any)({
    path: { id: applicationId },
  });
};

export const getInterviewQuestions = async (applicationId: string) => {
  return (ApplicantsController_getInterviewQuestions as any)({
    path: { id: applicationId },
  });
};

export const updateStage = async (data: {
  applicationId: string;
  stage: string;
}) => {
  return (ApplicantsController_advanceApplicationStage as any)({
    path: { id: data.applicationId },
    body: { stage: data.stage },
  });
};

export const updateDecision = async (data: {
  applicationId: string;
  decision: string;
}) => {
  return (ApplicantsController_applyDecision as any)({
    path: { id: data.applicationId },
    body: { decision: data.decision },
  });
};

export async function rehydrateAuth(): Promise<void> {
  const storedRole = getClientStoredRole();

  try {
    if (storedRole === "employer") {
      const employer = await getEmployerProfile();
      useAuthStore.getState().setAuth({
        token: COOKIE_AUTH_TOKEN,
        role: "employer",
        username: employer.name,
        email: employer.email,
        walletAddress: employer.walletAddress,
        id: employer.id,
      });
      return;
    }

    const user = await apiFetch<any>("/me/user", { authRole: "candidate" });
    if (user && user.id) {
      useAuthStore.getState().setAuth({
        token: COOKIE_AUTH_TOKEN,
        role: "candidate",
        username: user.username,
        email: user.email,
        id: user.id,
      });
    }
  } catch (error) {
    useAuthStore.getState().clearAuth();
  }
}

function getClientStoredRole(): AuthRole | null {
  if (typeof document === "undefined") {
    return null;
  }

  const roleCookie = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAMES.clientRole}=`))
    ?.split("=")[1];

  if (!roleCookie) {
    return null;
  }

  const role = decodeURIComponent(roleCookie).toLowerCase();
  return role === "candidate" || role === "employer" ? role : null;
}

export type PublicVouchDto = {
  id: string;
  message: string;
  voucherWallet: string;
  weight: string;
  confirmedAt: string;
};

export type PublicProfileDto = {
  username: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  careerPath: number;

  vouches: PublicVouchDto[];
};
export async function getPublicProfile(
  username: string,
): Promise<PublicProfileDto | null> {
  try {
    return await apiFetch<PublicProfileDto>(`/profile/public/${username}`, {
      skipAuth: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function apiUpload<ResponseBody>(
  path: string,
  file: File,
): Promise<ResponseBody> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const url = new URL(path, API_BASE_URL);

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(url.toString(), {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(body?.message || "Upload failed");
  }

  return body;
}

export async function uploadAvatar(file: File) {
  const body = await apiUpload("me/user/avatar", file);
  return body;
}
