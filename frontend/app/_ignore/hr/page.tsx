"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import {
  PlusCircle,
  Users,
  FileText,
  Send,
  Ghost,
  CheckCircle2,
  Circle,
  Briefcase,
  ShieldCheck,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import {
  JobsController_getMyJobs,
  normalizeJobStatus,
  unwrapApiSuccessData,
} from "@/lib/api";

//use HR : IGNORE

// Mock getTasks since it doesn't exist in api.ts
const getTasks = async () => {
  return []; // Returning empty to show the ghost state as requested
};

export default function HRDashboardPage() {
  const { user } = usePrivy();

  const { data: jobsResponse, isLoading: isLoadingJobs } = useQuery({
    queryKey: ["jobs", "me"],
    queryFn: () => JobsController_getMyJobs(),
  });

  const jobsRaw = unwrapApiSuccessData<unknown[]>(jobsResponse);
  const jobs = Array.isArray(jobsRaw)
    ? jobsRaw
    : Array.isArray(jobsResponse)
      ? jobsResponse
      : (jobsResponse as { data?: unknown[] })?.data ||
        (jobsResponse as { items?: unknown[] })?.items ||
        [];

  const isNewCompany = !isLoadingJobs && jobs.length === 0;

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: getTasks,
  });

  const draftCount = jobs.filter(
    (j: Record<string, unknown>) =>
      normalizeJobStatus(j.status) === "draft",
  ).length;
  const recentJobs = jobs.slice(0, 5);

  // Checklist state
  const [checklist, setChecklist] = useState({
    profile: false,
    job: false,
    escrow: false,
    contact: false,
  });
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("hr_checklist_dismissed");
    if (saved === "true") {
      setChecklistDismissed(true);
    }
  }, []);

  const dismissChecklist = () => {
    localStorage.setItem("hr_checklist_dismissed", "true");
    setChecklistDismissed(true);
  };

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // date formatting
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col xl:flex-row gap-8 w-full pb-10">
      <div className="flex-1 flex flex-col gap-8">
        {/* HEADER */}
        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Hello, {user?.name || user?.email?.address || "there"}
          </h1>
          <p className="text-slate-500 mt-1">
            {today} &mdash; Here&apos;s what needs your attention.
          </p>
        </section>

        {/* QUICK ACTIONS */}
        {isNewCompany ? (
          <EmptyState
            variant="hero"
            icon={Sparkles}
            title="Welcome to your hiring command center"
            description="16Signals helps you find and hire exceptional people, with real work samples, escrow-backed offers, and data-driven decisions."
            primaryAction={{ label: "Create your first job", route: "/hr/jobs/new" }}
            secondaryAction={{ label: "Complete company profile", route: "/hr/settings" }}
            features={[
              { icon: Briefcase, text: "Post jobs with an escrow bonus to attract serious candidates" },
              { icon: ShieldCheck, text: "Analyze real candidate work samples, not just CVs" },
              { icon: TrendingUp, text: "Hire with proof and track your pipeline end-to-end" },
            ]}
          />
        ) : (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/hr/jobs/new">
            <Card className="hover:border-violet-500 hover:shadow-md transition-all cursor-pointer h-full group">
              <CardContent className="p-6 flex flex-col items-start gap-4">
                <div className="p-3 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Create Job Post
                  </h3>
                  <p className="text-sm text-slate-500">Post a new role</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/hr/candidates">
            <Card className="hover:border-violet-500 hover:shadow-md transition-all cursor-pointer h-full group">
              <CardContent className="p-6 flex flex-col items-start gap-4">
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    View Applications
                  </h3>
                  <p className="text-sm text-slate-500">Review candidates</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/hr/jobs/draft">
            <Card className="hover:border-violet-500 hover:shadow-md transition-all cursor-pointer h-full group">
              <CardContent className="p-6 flex flex-col items-start gap-4">
                <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Draft Posts ({draftCount})
                  </h3>
                  <p className="text-sm text-slate-500">Continue writing</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/hr/contacts">
            <Card className="hover:border-violet-500 hover:shadow-md transition-all cursor-pointer h-full group">
              <CardContent className="p-6 flex flex-col items-start gap-4">
                <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    Outreach
                  </h3>
                  <p className="text-sm text-slate-500">Message contacts</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </section>

        {/* YOUR TASKS BOX */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Your Tasks ({tasks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
                    <Ghost className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                    You have no tasks right now.
                  </h3>
                  <div className="text-slate-500 text-sm max-w-sm">
                    <p className="mb-3">
                      Here are some suggestions to get started:
                    </p>
                    <ul className="text-left space-y-2 inline-block">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />{" "}
                        Send a connection request to a candidate
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />{" "}
                        Message a contact on LinkedIn
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />{" "}
                        Review pending applications
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />{" "}
                        Publish a draft job post
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Task list maps over tasks here */}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* RECENT JOB POSTS */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Recent Job Posts
            </h2>
            <Link href="/hr/jobs">
              <Button variant="link" className="text-violet-600 dark:text-violet-400 px-0">
                View all
              </Button>
            </Link>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead>Job Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-slate-500 py-8"
                    >
                      No recent job posts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentJobs.map((job: Record<string, unknown>) => {
                    const st = normalizeJobStatus(job.status);
                    const jid = String(job.id ?? "");
                    return (
                    <TableRow key={jid} className="group cursor-default">
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        {String(job.title ?? "")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            st === "draft" ? "secondary" : "default"
                          }
                          className={
                            st === "active"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100"
                              : st === "paused"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100"
                                : st === "closed"
                                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100"
                                  : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100"
                          }
                        >
                          {st || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {job.applicantsCount || 0}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {job.createdAt
                          ? new Date(job.createdAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/hr/jobs/${jid}`}>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
          </>
        )}
      </div>

      {/* GETTING STARTED CHECKLIST (RIGHT SIDEBAR) */}
      {!checklistDismissed && (
        <aside className="xl:w-80 flex-shrink-0">
          <Card className="sticky top-6 border-violet-100 dark:border-violet-900/50 shadow-sm">
            <CardHeader className="bg-violet-50/50 dark:bg-violet-900/10 border-b border-violet-100 dark:border-violet-900/50 pb-4">
              <CardTitle className="text-lg">Getting started</CardTitle>
              <CardDescription>
                Complete these steps to set up your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-4">
                <div
                  className="flex items-start gap-3 cursor-pointer group"
                  onClick={() => toggleChecklist("profile")}
                >
                  <div
                    className={`mt-0.5 transition-colors ${
                      checklist.profile
                        ? "text-emerald-500"
                        : "text-slate-300 dark:text-slate-600 group-hover:text-violet-400"
                    }`}
                  >
                    {checklist.profile ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium transition-all ${
                      checklist.profile
                        ? "text-slate-400 line-through dark:text-slate-500"
                        : "text-slate-700 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-300"
                    }`}
                  >
                    Complete company profile
                  </div>
                </div>

                <div
                  className="flex items-start gap-3 cursor-pointer group"
                  onClick={() => toggleChecklist("job")}
                >
                  <div
                    className={`mt-0.5 transition-colors ${
                      checklist.job
                        ? "text-emerald-500"
                        : "text-slate-300 dark:text-slate-600 group-hover:text-violet-400"
                    }`}
                  >
                    {checklist.job ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium transition-all ${
                      checklist.job
                        ? "text-slate-400 line-through dark:text-slate-500"
                        : "text-slate-700 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-300"
                    }`}
                  >
                    Create your first job post
                  </div>
                </div>

                <div
                  className="flex items-start gap-3 cursor-pointer group"
                  onClick={() => toggleChecklist("escrow")}
                >
                  <div
                    className={`mt-0.5 transition-colors ${
                      checklist.escrow
                        ? "text-emerald-500"
                        : "text-slate-300 dark:text-slate-600 group-hover:text-violet-400"
                    }`}
                  >
                    {checklist.escrow ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium transition-all ${
                      checklist.escrow
                        ? "text-slate-400 line-through dark:text-slate-500"
                        : "text-slate-700 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-300"
                    }`}
                  >
                    Set up escrow for a job{" "}
                    <span className="text-slate-400 font-normal ml-1">(optional)</span>
                  </div>
                </div>

                <div
                  className="flex items-start gap-3 cursor-pointer group"
                  onClick={() => toggleChecklist("contact")}
                >
                  <div
                    className={`mt-0.5 transition-colors ${
                      checklist.contact
                        ? "text-emerald-500"
                        : "text-slate-300 dark:text-slate-600 group-hover:text-violet-400"
                    }`}
                  >
                    {checklist.contact ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium transition-all ${
                      checklist.contact
                        ? "text-slate-400 line-through dark:text-slate-500"
                        : "text-slate-700 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-300"
                    }`}
                  >
                    Contact your first candidate
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-6">
                <Button
                  variant="ghost"
                  className="w-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={dismissChecklist}
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      )}
    </div>
  );
}
