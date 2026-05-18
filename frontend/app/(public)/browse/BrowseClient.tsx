"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FilterBar, FilterState } from "@/components/jobs/FilterBar";
import { JobCard, JobCardSkeleton, Job } from "@/components/jobs/JobCard";
import { JobDetailSheet } from "@/components/jobs/JobDetailSheet";
import {
  Search, MapPin, Users, Briefcase, ChevronRight,
  Bell, BellRing, CheckCircle2, Loader2, Lock,
} from "lucide-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import {
  listJobs, getJob, getGapPreview, getCandidateProfile, applyToJob,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const IS_CANDIDATE_ONLY = process.env.NEXT_PUBLIC_CANDIDATE_ONLY === "true";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Candidate {
  username: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  careerPath?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase();
}

function careerPathLabel(path?: number): string | null {
  if (path === undefined || path === null) return null;
  if (path & 1) return "Developer";
  return "Unknown";
}

// ---------------------------------------------------------------------------
// CandidateCard
// ---------------------------------------------------------------------------

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const display = candidate.username;
  const initials = getInitials(display);
  const pathLabel = careerPathLabel(candidate.careerPath);

  return (
    <div className="group relative flex items-center gap-5 rounded-xl border border-border bg-card px-6 py-5 transition-all duration-200 hover:border-primary/40 hover:bg-accent/30 hover:shadow-[0_0_0_1px_rgba(42,161,152,0.12)]">
      <Avatar className="h-12 w-12 shrink-0 ring-1 ring-border group-hover:ring-primary/30 transition-all duration-200">
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-mono font-semibold tracking-wide">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{display}</p>
          {pathLabel && (
            <span className="inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {pathLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground font-mono">@{candidate.username}</p>
        {candidate.bio && (
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {candidate.bio}
          </p>
        )}
        {candidate.location && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/70">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{candidate.location}</span>
          </div>
        )}
      </div>
      <div className="ml-4 shrink-0">
        <Button
          asChild variant="outline" size="sm"
          className="h-8 gap-1.5 rounded-lg border-border px-4 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all duration-150"
        >
          <Link href={`/u/${candidate.username}`}>
            View profile <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function CandidateCardSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-5 rounded-xl border border-border bg-card px-6 py-5">
      <div className="h-12 w-12 shrink-0 rounded-full bg-muted/30" />
      <div className="flex-1 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 rounded-md bg-muted/40" />
          <div className="h-4 w-16 rounded-md bg-muted/20" />
        </div>
        <div className="h-3 w-24 rounded-md bg-muted/30" />
        <div className="h-3 w-3/4 rounded-md bg-muted/20" />
      </div>
      <div className="ml-4 shrink-0">
        <div className="h-8 w-28 rounded-lg bg-muted/20" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employer launch waitlist, GUEST flow (email input)
// ---------------------------------------------------------------------------

function GuestWaitlistForm({
  onSuccess,
}: {
  onSuccess?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "duplicate" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/profile/waitlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      if (res.status === 409) {
        setStatus("duplicate");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Something went wrong.");
      }
      setStatus("done");
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message ?? "Failed to join waitlist.");
      setStatus("error");
    }
  }

  if (status === "duplicate") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <BellRing className="h-4 w-4 shrink-0" />
        <span>This email is already on the waitlist — we'll reach out when employers go live.</span>
      </div>
    );
  }

  return (
    <form
  onSubmit={handleSubmit}
className="flex w-full max-w-[300px] gap-5"
>
      <Input
        id="waitlist-email-input"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="h-10 flex-1 rounded-lg border-border bg-muted/20 text-sm placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
      />
      <Button
        id="waitlist-submit-btn"
        type="submit"
        disabled={status === "loading"}
className="h-10 shrink-0 w-[120px] rounded-lg bg-primary px-4 text-sm font-medium"      
>        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        Notify me
      </Button>
      {status === "error" && (
        <p className="text-xs text-destructive sm:col-span-2">{errorMsg}</p>
      )}
    </form>
  );
}


// ---------------------------------------------------------------------------
// Employer launch waitlist, AUTH flow (one-click button)
// ---------------------------------------------------------------------------

function AuthWaitlistButton({
  userEmail,
  onSuccess,
}: {
  userEmail?: string | null;
  onSuccess?: () => void;
}) {
  // "checking" while we determine existing registration status on mount.
  const [status, setStatus] = useState<"checking" | "idle" | "loading" | "done" | "error">("checking");

  // On mount, check if the user is already on the waitlist.
  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/me/user/waitlist`,
          { credentials: "include" },
        );
        if (!cancelled && res.ok) {
          const body = await res.json();
          if (body?.registered) {
            setStatus("done");
            onSuccess?.();
          } else {
            setStatus("idle");
          }
        } else if (!cancelled) {
          setStatus("idle");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    }
    checkStatus();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/me/user/waitlist`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error();
      // Both new registrations and already-registered cases resolve to "done".
      setStatus("done");
      onSuccess?.();
    } catch {
      setStatus("error");
    }
  }

  if (status === "checking") {
    return (
      <Button
        id="auth-waitlist-btn"
        disabled
        className="h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking…
      </Button>
    );
  }

return (
  <Button
    id="auth-waitlist-btn"
    onClick={handleClick}
    disabled={status === "loading" || status === "done"}
className="
  h-10
  rounded-lg
  bg-primary
  px-5
  text-sm
  font-medium
  text-primary-foreground
  hover:bg-primary/90
">    {status === "loading" ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <BellRing className="h-4 w-4" />
    )}

    {status === "done"
      ? "Notifications enabled"
      : "Notify me"}
  </Button>
)
}

// ---------------------------------------------------------------------------
// Jobs gated banner (CANDIDATE_ONLY mode)
// ---------------------------------------------------------------------------

function JobsGatedBanner({ me }: { me?: any }) {
  const isLoggedIn = !!me;
  const hasScorecard = !!me?.scorecard;
  const [waitlistDone, setWaitlistDone] = useState(false);
return (
  <div className="col-span-full flex justify-center px-4 py-16">
    <div className="w-full max-w-2xl">

      {/* Status */}
      <div className="mb-4 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          <Lock className="h-3.5 w-3.5" />
          Employer access in private rollout
        </div>
      </div>

      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Job postings are launching soon
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          We're onboarding verified companies and securing the employer side
          of 16Signals before opening roles publicly.
        </p>
      </div>

      {/* Primary candidate CTA */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <p className="text-sm font-semibold text-foreground">
              Prepare your candidate profile
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
Get your scorecard ready before employer access opens.            </p>
          </div>

          <div className="shrink-0">
            {isLoggedIn ? (
              hasScorecard ? (
                <Button
                  asChild
                  className="h-10 rounded-lg px-5"
                >
                  <Link href="/profile">
                    View scorecard
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  className="h-10 rounded-lg px-5"
                >
                  <Link href="/profile">
                    Build scorecard
                  </Link>
                </Button>
              )
            ) : (
              <Button
                asChild
                className="h-10 w-[120px] rounded-lg px-5"
              >
                <Link href="/auth">
                  Create profile
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-5">
  {waitlistDone ? (
    <div className="flex justify-center">
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/8 px-4 py-3 text-sm text-primary">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          You're on the list, we'll email you when employers go live.
        </span>
      </div>
    </div>
) : (
  <>
    {isLoggedIn ? (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <BellRing className="h-4 w-4 text-primary" />
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">
              Get notified when employer access opens
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              We’ll email you as soon as companies post roles.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <AuthWaitlistButton
            userEmail={me?.email}
            onSuccess={() => setWaitlistDone(true)}
          />
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />

            <p className="text-sm text-muted-foreground">
              Want early access updates?
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <GuestWaitlistForm
            onSuccess={() => setWaitlistDone(true)}
          />
        </div>

      </div>
    )}
  </>
)}
</div>
</div>
</div>
</div>
)
}

// ---------------------------------------------------------------------------
// Sort options (talent tab)
// ---------------------------------------------------------------------------

const SORT_OPTIONS = [
  { value: "recent", label: "Newest" },
  { value: "name", label: "A → Z" },
  // { value: "career", label: "Career Path" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BrowseClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get("tab") === "people" ? "people" : "jobs";
  const [tab, setTab] = useState(initialTab);

  // ── Jobs state ────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>({});
  const debouncedFilters = useDebounce(filters, 300);
  const [page, setPage] = useState(1);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const {
    data: jobsData,
    isLoading: jobsLoading,
    isFetching: jobsFetching,
  } = useQuery({
    queryKey: ["jobs", debouncedFilters, page],
    queryFn: async () => {
      const res = await listJobs({ ...debouncedFilters, page, limit: 12 });
      return (res as any).data ?? res;
    },
    // Disable job fetching entirely in candidate-only mode
    enabled: !IS_CANDIDATE_ONLY,
  });

  const { data: jobDetailData } = useQuery({
    queryKey: ["job", selectedJobId],
    queryFn: () => getJob(selectedJobId!),
    enabled: !!selectedJobId && !IS_CANDIDATE_ONLY,
  });

  const jobDetail = jobDetailData as any;

  useEffect(() => {
    setPage(1);
    setAllJobs([]);
  }, [debouncedFilters]);

  useEffect(() => {
    if (!jobsData?.jobs) return;
    setAllJobs((prev) => {
      if (page === 1) return jobsData.jobs;
      const existingIds = new Set(prev.map((j) => j.id));
      const newJobs = jobsData.jobs.filter((j: Job) => !existingIds.has(j.id));
      return [...prev, ...newJobs];
    });
  }, [jobsData, page]);

  const jobsTotal = jobsData?.total ?? 0;
  const hasMoreJobs = allJobs.length < jobsTotal;

  // ── Talent state ──────────────────────────────────────────────────────────
  const [talentSearch, setTalentSearch] = useState("");
  const debouncedTalentSearch = useDebounce(talentSearch, 300);
  const [talentSort, setTalentSort] = useState("recent");

  const { data: talentData, isLoading: talentLoading } = useQuery({
    queryKey: ["public-profiles", debouncedTalentSearch, talentSort],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedTalentSearch) params.append("q", debouncedTalentSearch);
      params.append("sort", talentSort);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/profile/public?${params.toString()}`
      );
      return res.json();
    },
  });

  const candidates: Candidate[] = talentData?.profiles || [];

  // ── User / scorecard state ────────────────────────────────────────────────
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getCandidateProfile,
  });
  const hasScorecard = !!me?.scorecard;

  // ── Sync tab with URL ─────────────────────────────────────────────────────
  const handleTabChange = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "people") {
      params.set("tab", "people");
    } else {
      params.delete("tab");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // ── Gap / apply ───────────────────────────────────────────────────────────
  const { data: gapData, isLoading: gapLoading } = useQuery({
    queryKey: ["gap", selectedJobId],
    enabled: !!selectedJobId && !!me?.scorecard && !IS_CANDIDATE_ONLY,
    queryFn: async () => {
      const res = await getGapPreview({ jobId: selectedJobId! });
      const d = (res as any).data ?? res as any;
      return {
        fitScore: d.roleFitScore ?? 0,
        matched: d.matchedTechnologies ?? [],
        missing: d.missingTechnologies ?? [],
        raw: d,
      };
    },
  });

  const queryClient = useQueryClient();
  const applyMut = useMutation({
    mutationFn: () => applyToJob({ jobId: selectedJobId! } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });

  const { data: myApps } = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      const res = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || "") + "/applications/me"
      );
      return res.json();
    },
    enabled: !IS_CANDIDATE_ONLY,
  });

  const isApplied = !!myApps?.applications?.some(
    (a: any) => a.jobId === selectedJobId
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Hero strip */}
      <div className="border-b border-border bg-background/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-screen-xl px-4 py-8 sm:px-6">
          <div className="mb-1 flex items-center gap-3">
            <div className="h-5 w-1 rounded-full bg-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Browse</h1>
          </div>
          <p className="ml-4 pl-3 text-sm text-muted-foreground">
            Discover verified talent across the network.
            {!IS_CANDIDATE_ONLY && " Open roles posted by verified employers."}
          </p>
        </div>
      </div>

      {/* Sticky tab bar */}
      <div className="sticky top-14 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-screen-xl px-4 sm:px-6">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="h-11 w-full rounded-none border-0 bg-transparent p-0 md:w-auto">
              <TabsTrigger
                value="jobs"
                className="h-11 rounded-none border-b-2 border-transparent px-5 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                Jobs
                {IS_CANDIDATE_ONLY && (
                  <span className="ml-1.5 inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-400">
                    Coming soon
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="h-11 rounded-none border-b-2 border-transparent px-5 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Talent
              </TabsTrigger>
            </TabsList>

            {/* Tab-specific controls */}
            <div className="mx-auto max-w-screen-xl">
              {tab === "jobs" && !IS_CANDIDATE_ONLY && (
                <div className="overflow-x-auto">
                  <FilterBar filters={filters} onChange={setFilters} />
                </div>
              )}

              {tab === "people" && (
                <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="talent-search"
                      value={talentSearch}
                      onChange={(e) => setTalentSearch(e.target.value)}
                      placeholder="Search by username or location…"
                      className="h-10 w-full rounded-lg border-border bg-muted/30 pl-10 pr-4 text-sm placeholder:text-muted-foreground/60 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTalentSort(opt.value)}
                        className={cn(
                          "h-10 cursor-pointer rounded-lg border px-3.5 text-xs font-medium transition-all duration-150 select-none",
                          talentSort === opt.value
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border bg-transparent text-muted-foreground hover:border-border/80 hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Content area */}
            <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
              {/* JOBS TAB */}
              <TabsContent value="jobs" className="mt-0 outline-none">
                {IS_CANDIDATE_ONLY ? (
                  <JobsGatedBanner me={me} />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {jobsLoading && page === 1
                        ? Array.from({ length: 6 }).map((_, i) => (
                            <JobCardSkeleton key={i} />
                          ))
                        : allJobs.length > 0
                        ? allJobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              isApplied={false}
                              isSelected={selectedJobId === job.id}
                              onClick={() =>
                                setSelectedJobId((prev) =>
                                  prev === job.id ? null : job.id
                                )
                              }
                            />
                          ))
                        : !jobsLoading && (
                            <div className="col-span-full flex flex-col items-center gap-2 py-20 text-center">
                              <p className="text-sm font-medium text-foreground">
                                No jobs match your filters
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Try adjusting or clearing filters to see more results.
                              </p>
                            </div>
                          )}
                    </div>

                    {hasMoreJobs && (
                      <div className="mt-8 flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={jobsFetching}
                        >
                          {jobsFetching ? "Loading…" : "Load more"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* TALENT TAB */}
              <TabsContent value="people" className="mt-0 outline-none">
                {!talentLoading && candidates.length > 0 && (
                  <p className="mb-4 text-xs text-muted-foreground">
                    {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} found
                    {debouncedTalentSearch && (
                      <>
                        {" "}for{" "}
                        <span className="font-medium text-foreground">
                          "{debouncedTalentSearch}"
                        </span>
                      </>
                    )}
                  </p>
                )}

                <div className="flex flex-col gap-3">
                  {talentLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <CandidateCardSkeleton key={i} />
                      ))
                    : candidates.length > 0
                    ? candidates.map((c) => (
                        <CandidateCard key={c.username} candidate={c} />
                      ))
                    : !talentLoading && (
                        <div className="flex flex-col items-center gap-3 py-24 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/20">
                            <Users className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {debouncedTalentSearch
                                ? "No candidates match your search"
                                : "No talent listed yet"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {debouncedTalentSearch
                                ? "Try a different name or location."
                                : "Check back soon as the community grows."}
                            </p>
                          </div>
                        </div>
                      )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Job detail slide-over */}
      {!IS_CANDIDATE_ONLY && (
        <JobDetailSheet
          job={jobDetail}
          jobId={selectedJobId}
          open={!!selectedJobId}
          onClose={() => setSelectedJobId(null)}
          hasScorecard={hasScorecard}
          onApply={() => applyMut.mutate()}
          isApplying={applyMut.isPending}
          isApplied={isApplied}
          gapData={gapData}
          gapLoading={gapLoading}
        />
      )}
    </div>
  );
}
