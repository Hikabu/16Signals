"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { JobsController_getMyJobs } from "@/lib/api";

//use HR : IGNORE

function PipelineSkeleton() {
  return (
    <div className="flex flex-col gap-8 w-full pb-10">
      <section>
        <Skeleton className="h-9 w-28" />
        <Skeleton className="mt-2 h-4 w-52" />
      </section>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-64 space-y-3">
            <Skeleton className="h-8 w-full rounded-lg" />
            {[...Array(3)].map((_, j) => (
              <Skeleton key={j} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: jobsResponse, isLoading } = useQuery({
    queryKey: ["jobs", "me"],
    queryFn: () => JobsController_getMyJobs(),
  });

  const jobs = Array.isArray(jobsResponse)
    ? jobsResponse
    : (jobsResponse as any)?.data || (jobsResponse as any)?.items || [];

  if (isLoading) {
    return <PipelineSkeleton />;
  }

  if (jobs.length === 0) {
    return (
      <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center">
        <EmptyState
          icon={GitBranch}
          title="Your hiring pipeline is empty"
          description="Track candidates from application to offer. Post a job to start receiving applicants and move them through your pipeline."
          primaryAction={{ label: "Post a job to start receiving applicants", route: "/hr/jobs/new" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full pb-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Pipeline
        </h1>
        <p className="text-slate-500 mt-1">Track candidates across stages.</p>
      </section>
      {/* Existing pipeline view would go here */}
      <section className="text-slate-500">
        Pipeline view placeholder (Data exists)
      </section>
    </div>
  );
}
