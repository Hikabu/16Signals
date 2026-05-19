"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { JobsController_getMyJobs } from "@/lib/api";

//use: HR

export default function AnalyticsPage() {
  const { data: jobsResponse, isLoading } = useQuery({
    queryKey: ["jobs", "me"],
    queryFn: () => JobsController_getMyJobs(),
  });

  const jobs = Array.isArray(jobsResponse)
    ? jobsResponse
    : (jobsResponse as any)?.data || (jobsResponse as any)?.items || [];

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading analytics...</div>;
  }

  if (jobs.length === 0) {
    return (
      <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center">
        <EmptyState
          icon={BarChart3}
          title="No hiring data yet"
          description="Analytics will appear after you publish jobs and receive candidates."
          primaryAction={{ label: "Create your first job", route: "/hr/jobs/new" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full pb-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Analytics
        </h1>
        <p className="text-slate-500 mt-1">Review your hiring metrics.</p>
      </section>
      {/* Existing analytics charts would go here */}
      <section className="text-slate-500">
        Analytics charts placeholder (Data exists)
      </section>
    </div>
  );
}
