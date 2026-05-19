"use client"

import { use } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Globe,
  History,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Shield,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// DTO Type
type CandidateAnalysisDto = {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  role: string
  location: string
  confidenceScore: number
  ownershipScore: number
  consistencyScore: number
  technicalDepthScore: number
  capabilities: {
    category: string
    score: number
    evidenceLevel: string
  }[]
  primaryLanguages: string[]
  infrastructureExposure: string[]
  repositoriesAnalyzed: number
  reviewActivity: number
}

// Mock Data
const candidateData: CandidateAnalysisDto = {
  id: "cand_01",
  username: "sarahchen",
  displayName: "Sarah Chen",
  avatarUrl: "",
  role: "Senior Frontend Engineer",
  location: "San Francisco, CA",
  confidenceScore: 94,
  ownershipScore: 87,
  consistencyScore: 91,
  technicalDepthScore: 89,
  capabilities: [
    { category: "Frontend Architecture", score: 95, evidenceLevel: "Strong" },
    { category: "React Ecosystem", score: 92, evidenceLevel: "Strong" },
    { category: "TypeScript", score: 88, evidenceLevel: "Moderate" },
    { category: "Testing", score: 85, evidenceLevel: "Moderate" },
    { category: "Performance", score: 82, evidenceLevel: "Moderate" },
    { category: "CI/CD", score: 76, evidenceLevel: "Limited" },
  ],
  primaryLanguages: ["TypeScript", "JavaScript", "Python", "Go"],
  infrastructureExposure: ["AWS", "Vercel", "Docker", "GitHub Actions"],
  repositoriesAnalyzed: 47,
  reviewActivity: 234,
}

// Extended mock data for additional sections
const activityData = {
  totalCommits: 2847,
  avgCommitsPerWeek: 24,
  prsOpened: 312,
  prsMerged: 298,
  reviewsGiven: 234,
  issuesClosed: 89,
  contributionStreak: 47,
  lastActive: "2 hours ago",
}

const reputationSignals = {
  followers: 1247,
  stars: 3890,
  forks: 412,
  sponsors: 23,
  discussions: 156,
  publicRepos: 67,
}

const riskIndicators = [
  {
    type: "low",
    label: "Employment Gap",
    description: "No significant gaps detected in contribution history",
    status: "clear",
  },
  {
    type: "low",
    label: "Code Quality",
    description: "Consistent code review feedback, low rejection rate",
    status: "clear",
  },
  {
    type: "medium",
    label: "Team Collaboration",
    description: "Limited evidence of large team contributions",
    status: "monitor",
  },
  {
    type: "low",
    label: "Commit Patterns",
    description: "Regular, consistent commit schedule",
    status: "clear",
  },
]

const ownershipEvidence = [
  {
    repo: "react-data-grid",
    role: "Primary Maintainer",
    commits: 847,
    percentage: 68,
    stars: 2340,
  },
  {
    repo: "typescript-utils",
    role: "Creator",
    commits: 234,
    percentage: 100,
    stars: 890,
  },
  {
    repo: "next-auth-adapter",
    role: "Core Contributor",
    commits: 156,
    percentage: 34,
    stars: 456,
  },
]

export default function CandidateAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const candidate = candidateData

  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col">
        {/* Page Header with Actions */}
        <div className="border-b bg-card/50 px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
                <span className="sr-only">Back to dashboard</span>
              </Link>
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex flex-1 items-center gap-4">
              <Avatar className="size-12 border-2 border-primary/20">
                <AvatarImage src={candidate.avatarUrl} alt={candidate.displayName} />
                <AvatarFallback className="text-lg font-semibold">
                  {candidate.displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{candidate.displayName}</h1>
                  <Badge variant="secondary" className="font-mono text-xs">
                    @{candidate.username}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{candidate.role}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {candidate.location}
                  </span>
                </div>
              </div>
            </div>

            {/* Recruiter Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Bookmark className="mr-2 size-4" />
                Save
              </Button>
              <Button variant="outline" size="sm">
                <Mail className="mr-2 size-4" />
                Contact
              </Button>
              <Button size="sm">
                <Calendar className="mr-2 size-4" />
                Schedule Interview
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <FileText className="mr-2 size-4" />
                    Export Report
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ExternalLink className="mr-2 size-4" />
                    View GitHub Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Users className="mr-2 size-4" />
                    Add to Pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <MessageSquare className="mr-2 size-4" />
                    Add Note
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <XCircle className="mr-2 size-4" />
                    Reject Candidate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Section 1 & 2: Confidence Indicators (Primary Metrics) */}
            <div className="grid gap-4 md:grid-cols-4">
              <ConfidenceCard
                label="Hiring Confidence"
                value={candidate.confidenceScore}
                description="Overall evidence-based assessment"
                icon={Shield}
                primary
              />
              <ConfidenceCard
                label="Ownership"
                value={candidate.ownershipScore}
                description="Code ownership & maintainership"
                icon={GitBranch}
              />
              <ConfidenceCard
                label="Consistency"
                value={candidate.consistencyScore}
                description="Contribution regularity"
                icon={TrendingUp}
              />
              <ConfidenceCard
                label="Technical Depth"
                value={candidate.technicalDepthScore}
                description="Complexity of contributions"
                icon={Code2}
              />
            </div>

            {/* Analysis Tabs */}
            <Tabs defaultValue="capabilities" className="space-y-4">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
                <TabsTrigger value="ownership">Ownership</TabsTrigger>
                <TabsTrigger value="stack">Stack</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="reputation">Reputation</TabsTrigger>
                <TabsTrigger value="risks">Risks</TabsTrigger>
              </TabsList>

              {/* Section 3: Capability Analysis */}
              <TabsContent value="capabilities" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base font-medium">
                        Capability Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {candidate.capabilities.map((cap) => (
                        <CapabilityRow key={cap.category} capability={cap} />
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-medium">
                        Evidence Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Repositories Analyzed
                          </span>
                          <span className="font-mono font-medium">
                            {candidate.repositoriesAnalyzed}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Code Reviews
                          </span>
                          <span className="font-mono font-medium">
                            {candidate.reviewActivity}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Total Commits
                          </span>
                          <span className="font-mono font-medium">
                            {activityData.totalCommits.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Analysis Confidence
                        </p>
                        <div className="flex items-center gap-2">
                          <Progress value={94} className="h-2 flex-1" />
                          <span className="text-sm font-mono text-signal-high">
                            High
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Based on 47 public repositories with 2,847 commits
                          over 4 years of activity.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Section 4: Technical Ownership */}
              <TabsContent value="ownership" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">
                      Code Ownership Evidence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {ownershipEvidence.map((repo) => (
                        <OwnershipRow key={repo.repo} repo={repo} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Section 5: Stack Fingerprint */}
              <TabsContent value="stack" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-medium">
                        Primary Languages
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {candidate.primaryLanguages.map((lang) => (
                          <LanguageBadge key={lang} language={lang} />
                        ))}
                      </div>
                      <Separator className="my-4" />
                      <LanguageBreakdown />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-medium">
                        Infrastructure Exposure
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {candidate.infrastructureExposure.map((infra) => (
                          <Badge
                            key={infra}
                            variant="outline"
                            className="font-normal"
                          >
                            {infra}
                          </Badge>
                        ))}
                      </div>
                      <Separator className="my-4" />
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p>
                          Infrastructure evidence detected across{" "}
                          {candidate.repositoriesAnalyzed} repositories.
                        </p>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-signal-high" />
                          <span>CI/CD pipeline configurations found</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-signal-high" />
                          <span>Docker containerization experience</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-signal-high" />
                          <span>Cloud deployment evidence</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Section 6: Engineering Activity */}
              <TabsContent value="activity" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <ActivityCard
                    label="Total Commits"
                    value={activityData.totalCommits.toLocaleString()}
                    subtext={`${activityData.avgCommitsPerWeek}/week avg`}
                    icon={GitCommit}
                  />
                  <ActivityCard
                    label="PRs Merged"
                    value={activityData.prsMerged.toString()}
                    subtext={`${Math.round((activityData.prsMerged / activityData.prsOpened) * 100)}% merge rate`}
                    icon={GitMerge}
                  />
                  <ActivityCard
                    label="Reviews Given"
                    value={activityData.reviewsGiven.toString()}
                    subtext="Code review contributions"
                    icon={Eye}
                  />
                  <ActivityCard
                    label="Contribution Streak"
                    value={`${activityData.contributionStreak} days`}
                    subtext="Current streak"
                    icon={TrendingUp}
                  />
                </div>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-medium">
                      Contribution Timeline
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      Last active {activityData.lastActive}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ContributionHeatmap />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Section 7: Reputation Signals */}
              <TabsContent value="reputation" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <ReputationCard
                    label="Followers"
                    value={reputationSignals.followers.toLocaleString()}
                    icon={Users}
                    trend="+12% this month"
                  />
                  <ReputationCard
                    label="Stars Earned"
                    value={reputationSignals.stars.toLocaleString()}
                    icon={Star}
                    trend="Across 67 repos"
                  />
                  <ReputationCard
                    label="Sponsors"
                    value={reputationSignals.sponsors.toString()}
                    icon={ThumbsUp}
                    trend="Active sponsorships"
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">
                      Community Engagement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-1">
                        <p className="text-2xl font-mono font-semibold">
                          {reputationSignals.forks}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Repository forks
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-mono font-semibold">
                          {reputationSignals.discussions}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Discussion contributions
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-mono font-semibold">
                          {reputationSignals.publicRepos}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Public repositories
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-mono font-semibold">4.2y</p>
                        <p className="text-xs text-muted-foreground">
                          Account age
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Section 9: Risk Indicators */}
              <TabsContent value="risks" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">
                      Risk Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {riskIndicators.map((risk, i) => (
                      <RiskRow key={i} risk={risk} />
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-signal-high/20 bg-signal-high/5">
                  <CardContent className="flex items-start gap-3 p-4">
                    <CheckCircle2 className="mt-0.5 size-5 text-signal-high" />
                    <div>
                      <p className="font-medium">
                        Low Risk Profile
                      </p>
                      <p className="text-sm text-muted-foreground">
                        This candidate shows consistent activity patterns,
                        strong code quality indicators, and no significant red
                        flags detected across{" "}
                        {candidate.repositoriesAnalyzed} analyzed repositories.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ============================================================================
// REUSABLE METRIC COMPONENTS
// ============================================================================

function ConfidenceCard({
  label,
  value,
  description,
  icon: Icon,
  primary,
}: {
  label: string
  value: number
  description: string
  icon: React.ElementType
  primary?: boolean
}) {
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-signal-high"
    if (score >= 70) return "text-signal-medium"
    return "text-signal-low"
  }

  return (
    <Card className={cn(primary && "border-primary/30 bg-primary/5")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon
            className={cn(
              "size-4",
              primary ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className={cn("stat-value", getScoreColor(value))}>
            {value}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        <Progress
          value={value}
          className={cn("mt-2 h-1.5", primary && "[&>div]:bg-primary")}
        />
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function CapabilityRow({
  capability,
}: {
  capability: CandidateAnalysisDto["capabilities"][0]
}) {
  const getEvidenceColor = (level: string) => {
    switch (level) {
      case "Strong":
        return "text-signal-high bg-signal-high/10"
      case "Moderate":
        return "text-signal-medium bg-signal-medium/10"
      default:
        return "text-signal-neutral bg-signal-neutral/10"
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{capability.category}</span>
          <span className="font-mono text-sm text-muted-foreground">
            {capability.score}
          </span>
        </div>
        <Progress value={capability.score} className="mt-1.5 h-1.5" />
      </div>
      <Badge
        variant="secondary"
        className={cn("text-xs font-normal", getEvidenceColor(capability.evidenceLevel))}
      >
        {capability.evidenceLevel}
      </Badge>
    </div>
  )
}

function OwnershipRow({
  repo,
}: {
  repo: (typeof ownershipEvidence)[0]
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted">
        <Folder className="size-5 text-primary" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{repo.repo}</span>
          <Badge variant="outline" className="text-xs font-normal">
            {repo.role}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <GitCommit className="size-3" />
            {repo.commits} commits
          </span>
          <span>{repo.percentage}% contribution</span>
          <span className="flex items-center gap-1">
            <Star className="size-3" />
            {repo.stars.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="text-right">
        <Progress value={repo.percentage} className="h-1.5 w-20" />
      </div>
    </div>
  )
}

function LanguageBadge({ language }: { language: string }) {
  const colors: Record<string, string> = {
    TypeScript: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    JavaScript: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    Python: "bg-green-500/10 text-green-400 border-green-500/30",
    Go: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  }

  return (
    <Badge
      variant="outline"
      className={cn("font-medium", colors[language] || "")}
    >
      {language}
    </Badge>
  )
}

function LanguageBreakdown() {
  const languages = [
    { name: "TypeScript", percentage: 58, color: "bg-blue-500" },
    { name: "JavaScript", percentage: 24, color: "bg-yellow-500" },
    { name: "Python", percentage: 12, color: "bg-green-500" },
    { name: "Go", percentage: 6, color: "bg-cyan-500" },
  ]

  return (
    <div className="space-y-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {languages.map((lang) => (
          <div
            key={lang.name}
            className={cn("h-full", lang.color)}
            style={{ width: `${lang.percentage}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {languages.map((lang) => (
          <div key={lang.name} className="flex items-center gap-2">
            <div className={cn("size-2 rounded-full", lang.color)} />
            <span className="text-muted-foreground">{lang.name}</span>
            <span className="font-mono">{lang.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string
  value: string
  subtext: string
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-2">
          <span className="stat-value">{value}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      </CardContent>
    </Card>
  )
}

function ReputationCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string
  value: string
  icon: React.ElementType
  trend: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="mt-1">
              <span className="stat-value text-signal-high">{value}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{trend}</p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RiskRow({ risk }: { risk: (typeof riskIndicators)[0] }) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "clear":
        return <CheckCircle2 className="size-4 text-signal-high" />
      case "monitor":
        return <AlertTriangle className="size-4 text-signal-medium" />
      default:
        return <XCircle className="size-4 text-signal-low" />
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      {getStatusIcon(risk.status)}
      <div className="flex-1">
        <p className="text-sm font-medium">{risk.label}</p>
        <p className="text-xs text-muted-foreground">{risk.description}</p>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "text-xs font-normal",
          risk.status === "clear"
            ? "border-signal-high/30 text-signal-high"
            : "border-signal-medium/30 text-signal-medium"
        )}
      >
        {risk.status === "clear" ? "Clear" : "Monitor"}
      </Badge>
    </div>
  )
}

function ContributionHeatmap() {
  // Generate 52 weeks of mock data
  const weeks = Array.from({ length: 52 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const rand = Math.random()
      if (rand > 0.7) return 4
      if (rand > 0.5) return 3
      if (rand > 0.3) return 2
      if (rand > 0.15) return 1
      return 0
    })
  )

  const getColor = (level: number) => {
    switch (level) {
      case 0:
        return "bg-muted"
      case 1:
        return "bg-primary/20"
      case 2:
        return "bg-primary/40"
      case 3:
        return "bg-primary/60"
      case 4:
        return "bg-primary"
      default:
        return "bg-muted"
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((day, dayIndex) => (
              <Tooltip key={dayIndex}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "size-3 rounded-sm transition-colors hover:ring-1 hover:ring-primary/50",
                      getColor(day)
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {day === 0
                      ? "No contributions"
                      : `${day * 3} contributions`}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn("size-3 rounded-sm", getColor(level))}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
