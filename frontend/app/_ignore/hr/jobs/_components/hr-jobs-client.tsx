"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, PlusCircle } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  JobsController_getMyJobs,
  normalizeJobStatus,
  unwrapApiSuccessData,
} from "@/lib/api";

export type HrJobsTab = "all" | "draft" | "active";

function JobsPageSkeleton() {
  return (
    <div className="flex w-full flex-col gap-8 pb-10">
      <section>
        <Skeleton className="h-9 w-24" />
        <Skeleton className="mt-2 h-4 w-48" />
      </section>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function HRJobsClient({ tab }: { tab: HrJobsTab }) {
  const statusQuery =
    tab === "draft" || tab === "active" ? ({ status: tab } as const) : undefined;

  const { data: jobsResponse, isLoading } = useQuery({
    queryKey: ["jobs", "me", tab],
    queryFn: () =>
      JobsController_getMyJobs(
        statusQuery ? { query: statusQuery } : undefined,
      ),
  });

  const jobsRaw = unwrapApiSuccessData<unknown[]>(jobsResponse);
  const jobs = Array.isArray(jobsRaw)
    ? jobsRaw
    : Array.isArray((jobsResponse as { items?: unknown })?.items)
      ? ((jobsResponse as { items: unknown[] }).items ?? [])
      : [];

  if (isLoading) {
    return <JobsPageSkeleton />;
  }

  if (jobs.length === 0) {
    return (
      <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center">
        <EmptyState
          icon={Briefcase}
          title={
            tab === "draft"
              ? "No draft jobs"
              : tab === "active"
                ? "No active jobs"
                : "You haven't posted any jobs yet"
          }
          description={
            tab === "all"
              ? "Create a job post → fund escrow → candidates apply with real work → shortlist the best → hire with confidence."
              : tab === "draft"
                ? "Save a job as draft from the create page, or publish when ready."
                : "Publish a draft to open it for applicants."
          }
          primaryAction={{ label: "Create job post", route: "/hr/jobs/new" }}
        />
      </div>
    );
  }

  const title =
    tab === "draft"
      ? "Draft jobs"
      : tab === "active"
        ? "Active jobs"
        : "All jobs";

  const subtitle =
    tab === "draft"
      ? "Continue editing drafts or publish when ready."
      : tab === "active"
        ? "Open pipelines for roles currently accepting applicants."
        : "Manage your job postings and open the candidate pipeline.";

  return (
    <div className="flex w-full flex-col gap-8 pb-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 text-slate-500">{subtitle}</p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/hr/jobs/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create job
          </Link>
        </Button>
      </section>

      <CardTable jobs={jobs} />
    </div>
  );
}

function CardTable({ jobs }: { jobs: Record<string, unknown>[] }) {
  return (
    <section>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
              <TableHead>Job title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Applicants</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-slate-500"
                >
                  No jobs match this filter.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job, rowIdx) => {
                const id = String(job.id ?? "");
                const st = normalizeJobStatus(job.status);
                return (
                  <TableRow key={id || `row-${rowIdx}`} className="group">
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {String(job.title ?? "Untitled")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={st === "draft" ? "secondary" : "default"}
                        className={
                          st === "active"
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : st === "paused"
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
                              : st === "closed"
                                ? "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
                        }
                      >
                        {st || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-slate-600 dark:text-slate-400">
                      {Number(
                        job.applicantsCount ??
                          job.applicationsCount ??
                          job.applicationCount ??
                          0,
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {job.createdAt
                        ? new Date(String(job.createdAt)).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/jobs/${id}`}>Preview</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/hr/jobs/${id}`}>Pipeline</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
