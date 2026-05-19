"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { JobsController_getMyJobs, getEmployerCandidateCount } from "@/lib/api";


//use HR : IGNORE

function CandidatesPageSkeleton() {
  return (
    <div className="flex flex-col gap-8 w-full pb-10">
      <section>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-4 w-56" />
      </section>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function HRCandidatesPage() {
  // Fetch jobs to derive candidate count
  const { data: jobsResponse, isLoading } = useQuery({
    queryKey: ["jobs", "me"],
    queryFn: () => JobsController_getMyJobs(),
  });

  // Derive candidate count from jobs (fallback if no summary endpoint)
  const jobs = React.useMemo(() => {
    if (!jobsResponse) return [];
    return (
      (jobsResponse as any)?.data ?? 
      (jobsResponse as any)?.items ?? 
      (Array.isArray(jobsResponse) ? jobsResponse : [])
    );
  }, [jobsResponse]);

  const candidateCount = React.useMemo(() => {
    if (!Array.isArray(jobs)) return 0;
    return jobs.reduce((total: number, job: any) => {
      const count = 
        job.applicationsCount ?? 
        job.applicantsCount ?? 
        job.candidates?.length ?? 
        0;
      return total + (typeof count === "number" ? count : 0);
    }, 0);
  }, [jobs]);

  if (isLoading) {
    return <CandidatesPageSkeleton />;
  }

  // Empty state: no candidates yet
  if (candidateCount === 0) {
    return (
      <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center">
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description="Once candidates apply to your jobs, they'll appear here. Start by posting a job to attract talent."
          primaryAction={{ 
            label: "Post a job", 
            route: "/hr/jobs/new" 
          }}
          secondaryAction={{
            label: "Browse public jobs",
            route: "/jobs",
            variant: "ghost" as const
          }}
        />
      </div>
    );
  }

  // TODO: Replace with real candidates table when data exists
  return (
    <div className="flex flex-col gap-8 w-full pb-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Candidates
        </h1>
        <p className="text-slate-500 mt-1">
          Review your {candidateCount} applicant{candidateCount !== 1 ? "s" : ""}.
        </p>
      </section>
      
      {/* Candidates table placeholder */}
      <section className="text-slate-500 border rounded-lg p-6 bg-muted/30">
        Candidates table component goes here
        <div className="mt-2 text-sm">
          Total: {candidateCount} candidate{candidateCount !== 1 ? "s" : ""}
        </div>
      </section>
    </div>
  );
}
