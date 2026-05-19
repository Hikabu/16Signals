"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Clock,
  GitBranch,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardGrid,
  DashboardHeader,
  DashboardSection,
  DashboardShell,
} from "@/components/dashboard-shell";
import { 
  getEmployerProfile, 
  AnalyticsController_getDashboard, 
  JobsController_getMyJobs,
  ApplicantsController_getGapPreview
} from "@/lib/api";

//use HR : IGNORE


// ============ TYPES ============
interface Candidate {
  id: string | number;
  name: string;
  role: string;
  github?: string;
  avatar?: string;
  matchScore: number;
  stage: string;
  added: string;
  jobId?: string;
}

interface PipelineStage {
  name: string;
  count: number;
  percentage: number;
}

interface StatData {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: React.ElementType;
  positive?: boolean;
}

// ============ MAIN COMPONENT ============
export default function DashboardPage() {
  // Fetch employer profile
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery({
    queryKey: ["employerProfile"],
    queryFn: getEmployerProfile,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch dashboard analytics
  const { data: analytics, isLoading: isAnalyticsLoading, error: analyticsError } = useQuery({
    queryKey: ["dashboardAnalytics"],
    queryFn: async () => {
      const response = await AnalyticsController_getDashboard();
      // Handle wrapped vs unwrapped responses
      return (response as any)?.data ?? response;
    },
    retry: false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch employer's jobs
  const { data: jobs, isLoading: isJobsLoading, error: jobsError } = useQuery({
    queryKey: ["jobs", "me"],
    queryFn: async () => {
      const response = await JobsController_getMyJobs();
      return (response as any)?.data ?? (response as any)?.items ?? response;
    },
    retry: false,
    staleTime: 3 * 60 * 1000,
  });

  const isLoading = isProfileLoading || isAnalyticsLoading || isJobsLoading;
  const hasError = profileError || analyticsError || jobsError;

  // ============ DATA TRANSFORMATION ============
  
  // Transform analytics to stat cards - NO FALLBACKS
  const stats: StatData[] = React.useMemo(() => {
    if (!analytics) return [];
    
    return [
      {
        title: "Total Candidates",
        value: String(analytics.totalCandidatesShortlisted ?? analytics.total_candidates ?? 0),
        change: 0, // TODO: Get real change % from API if available
        changeLabel: "from last month",
        icon: Users,
      },
      {
        title: "Active Jobs",
        value: String(analytics.activeJobs ?? analytics.active_jobs ?? 0),
        change: 0,
        changeLabel: "from last month",
        icon: Briefcase,
      },
      {
        title: "In Pipeline",
        value: String(analytics.inPipeline ?? analytics.in_pipeline ?? analytics.totalCandidatesShortlisted ?? 0),
        change: 0,
        changeLabel: "from last week",
        icon: GitBranch,
      },
      {
        title: "Avg. Time to Hire",
        value: analytics.avgTimeToHire ? `${analytics.avgTimeToHire} days` : "—",
        change: 0,
        changeLabel: "from last quarter",
        icon: Clock,
        positive: true,
      },
    ];
  }, [analytics]);

  // Transform analytics to pipeline stages - NO FALLBACKS
  const pipelineStages: PipelineStage[] = React.useMemo(() => {
    if (!analytics) return [];
    
    const stages: Record<string, { count: number }> = {
      New: { count: analytics.newCandidates ?? analytics.new_candidates ?? 0 },
      Screening: { count: analytics.screeningCandidates ?? analytics.screening_candidates ?? 0 },
      Technical: { count: analytics.technicalCandidates ?? analytics.technical_candidates ?? 0 },
      Interview: { count: analytics.interviewingCandidates ?? analytics.interviewing_candidates ?? 0 },
      Offer: { count: analytics.offeredCandidates ?? analytics.offered_candidates ?? 0 },
      Hired: { count: analytics.hiredCandidates ?? analytics.hired_candidates ?? 0 },
    };

    const total = Object.values(stages).reduce((sum, s) => sum + s.count, 0) || 1;
    
    return Object.entries(stages).map(([name, { count }]) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100),
    }));
  }, [analytics]);

  // Transform jobs/applications to recent candidates - NO FALLBACKS
  const recentCandidates: Candidate[] = React.useMemo(() => {
    if (!jobs || !Array.isArray(jobs)) return [];
    
    // Flatten applications from all jobs
    const applications = jobs.flatMap((job: any) => {
      const apps = job.applications ?? job.candidates ?? [];
      return Array.isArray(apps) ? apps.map((app: any) => ({ ...app, jobId: job.id, jobTitle: job.title })) : [];
    });

    return applications
      .slice(0, 5)
      .map((app: any): Candidate => ({
        id: app.id ?? app.candidateId ?? `app-${Math.random()}`,
        name: app.candidate?.name ?? app.name ?? "Unknown",
        role: app.jobTitle ?? job?.title ?? "Candidate",
        github: app.candidate?.github ?? app.github ?? "",
        avatar: app.candidate?.avatar ?? app.avatar ?? "",
        matchScore: app.scorecard?.score ?? app.matchScore ?? app.score ?? 0,
        stage: app.pipelineStage ?? app.stage ?? app.status ?? "New",
        added: app.createdAt 
          ? new Date(app.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) 
          : "Recently",
        jobId: app.jobId,
      }));
  }, [jobs]);

  // ============ ERROR HANDLING ============
  if (hasError) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Dashboard" description="Error loading data" />
        <Card className="p-6">
          <div className="text-center space-y-4">
            <div className="text-red-500 font-medium">
              Unable to load dashboard data
            </div>
            <p className="text-sm text-muted-foreground">
              {profileError?.message || analyticsError?.message || jobsError?.message || "Please try again later."}
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </div>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Dashboard"
        description={
          profile?.name 
            ? `Overview of ${profile.name}'s hiring pipeline and candidate analytics.` 
            : "Overview of your hiring pipeline and candidate analytics."
        }
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/hr/dashboard/export">Export Report</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/hr/jobs/new">Create Job</Link>
        </Button>
      </DashboardHeader>

      {/* Stats Grid */}
      <DashboardSection>
        <DashboardGrid columns={4}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
          ) : stats.length > 0 ? (
            stats.map((stat, i) => (
              <StatCard key={i} {...stat} />
            ))
          ) : (
            <div className="col-span-4 text-center text-muted-foreground py-8">
              No analytics data available
            </div>
          )}
        </DashboardGrid>
      </DashboardSection>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Recent Candidates */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Recent Candidates</CardTitle>
            <Button variant="ghost" size="sm" className="text-primary" asChild>
              <Link href="/hr/candidates">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading candidates...</div>
            ) : recentCandidates.length > 0 ? (
              recentCandidates.map((candidate) => (
                <CandidateRow key={candidate.id} candidate={candidate} />
              ))
            ) : (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No candidates yet. <Link href="/hr/jobs/new" className="text-primary hover:underline">Create a job</Link> to start receiving applications.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Summary */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base font-medium">Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="text-center text-muted-foreground text-sm">Loading pipeline...</div>
            ) : pipelineStages.length > 0 ? (
              pipelineStages.map((stage) => (
                <PipelineStage key={stage.name} stage={stage} />
              ))
            ) : (
              <div className="text-center text-muted-foreground text-sm py-4">
                No pipeline data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Matches - Hidden if no endpoint yet */}
      <DashboardSection>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top Matches This Week</h2>
          <Button variant="ghost" size="sm" className="text-primary" asChild disabled>
            <Link href="/hr/candidates?sort=match">View all matches</Link>
          </Button>
        </div>
        <Card className="p-6 text-center text-muted-foreground">
          Top matches feature coming soon. Candidates will appear here based on job fit analysis.
        </Card>
      </DashboardSection>
    </DashboardShell>
  );
}

// ============ SUB-COMPONENTS (Design Preserved) ============

function SkeletonStatCard() {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-4" />
        </div>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  positive,
}: StatData & { icon: React.ElementType }) {
  const isPositive = positive !== undefined ? positive : change >= 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{title}</span>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold">{value}</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {change !== 0 && (
            <>
              {isPositive ? (
                <ArrowUpRight className="size-3 text-green-500" />
              ) : (
                <ArrowDownRight className="size-3 text-red-500" />
              )}
              <span className={isPositive ? "text-green-500" : "text-red-500"}>
                {Math.abs(change)}%
              </span>
              <span className="text-muted-foreground">{changeLabel}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const initials = candidate.name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Link
      href={`/hr/candidates/${candidate.id}`}
      className="flex items-center gap-4 border-b px-6 py-3 last:border-0 transition-colors hover:bg-muted/50"
    >
      <Avatar className="size-9">
        <AvatarImage src={candidate.avatar} alt={candidate.name} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{candidate.name}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal shrink-0">
            {candidate.matchScore}% match
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {candidate.role}{candidate.github && ` · ${candidate.github}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <Badge variant="outline" className={`text-xs ${getStageColor(candidate.stage)}`}>
          {candidate.stage}
        </Badge>
        <p className="mt-0.5 text-xs text-muted-foreground">{candidate.added}</p>
      </div>
    </Link>
  );
}

function PipelineStage({ stage }: { stage: PipelineStage }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{stage.name}</span>
        <span className="font-mono text-muted-foreground">{stage.count}</span>
      </div>
      <Progress value={stage.percentage} className="h-1.5" />
    </div>
  );
}

function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    New: "border-blue-500/30 text-blue-600",
    Screening: "border-yellow-500/30 text-yellow-600",
    Technical: "border-purple-500/30 text-purple-600",
    Interview: "border-indigo-500/30 text-indigo-600",
    Offer: "border-green-500/30 text-green-600",
    Hired: "border-emerald-500/30 text-emerald-600",
  };
  return colors[stage] || "border-gray-300 text-gray-600";
}