/*
  Warnings:

  - You are about to drop the column `behaviorPattern` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the column `confidenceTier` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the column `fitTier` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the column `fraudTier` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the column `riskLevel` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the column `roleFitScore` on the `shortlists` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AnalysisMode" AS ENUM ('LIGHT', 'DEEP');

-- CreateEnum
CREATE TYPE "SeniorityTier" AS ENUM ('INTERN_JUNIOR', 'MID', 'SENIOR', 'STAFF_LEAD', 'PRINCIPAL_PLUS');

-- CreateEnum
CREATE TYPE "RoleArchetype" AS ENUM ('BACKEND', 'FRONTEND', 'PLATFORM_DEVOPS_SRE', 'DATA_ML', 'SECURITY', 'MOBILE');

-- CreateEnum
CREATE TYPE "AuthenticityFlag" AS ENUM ('CLEAN', 'SOFT_CONCERN', 'HARD_STOP');

-- CreateEnum
CREATE TYPE "InterviewDepth" AS ENUM ('LIGHT', 'STANDARD', 'DEEP');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'CONSENTED', 'ANALYSING', 'COMPLETE', 'EXPIRED');

-- DropIndex
DROP INDEX "shortlists_jobPostId_roleFitScore_idx";

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "archetypeTarget" "RoleArchetype",
ADD COLUMN     "evaluationLinkId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "flags" JSONB,
ADD COLUMN     "mode" "AnalysisMode" NOT NULL DEFAULT 'LIGHT',
ADD COLUMN     "seniorityTarget" "SeniorityTier";

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "activeBriefJobId" TEXT;

-- AlterTable
ALTER TABLE "github_profiles" ADD COLUMN     "deepModeEnabledAt" TIMESTAMP(3),
ADD COLUMN     "grantedRepoIds" JSONB,
ADD COLUMN     "installationId" TEXT,
ADD COLUMN     "installationToken" TEXT;

-- AlterTable
ALTER TABLE "shortlists" DROP COLUMN "behaviorPattern",
DROP COLUMN "confidenceTier",
DROP COLUMN "fitTier",
DROP COLUMN "fraudTier",
DROP COLUMN "riskLevel",
DROP COLUMN "roleFitScore",
ADD COLUMN     "authenticityFlag" "AuthenticityFlag" NOT NULL DEFAULT 'CLEAN',
ADD COLUMN     "hasHardStop" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profileLevelGate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recommendedDepth" "InterviewDepth";

-- DropEnum
DROP TYPE "BehaviorPattern";

-- DropEnum
DROP TYPE "ConfidenceTier";

-- DropEnum
DROP TYPE "FitTier";

-- DropEnum
DROP TYPE "FraudTier";

-- DropEnum
DROP TYPE "RiskLevel";

-- CreateTable
CREATE TABLE "evaluation_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',
    "seniorityTarget" "SeniorityTier" NOT NULL,
    "archetypeTarget" "RoleArchetype" NOT NULL,
    "installationId" TEXT,
    "pendingState" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hire_outcomes" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "hired" BOOLEAN NOT NULL,
    "performanceRating" INTEGER,
    "flagsWereAccurate" BOOLEAN,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hire_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_links_token_key" ON "evaluation_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "hire_outcomes_analysisJobId_key" ON "hire_outcomes"("analysisJobId");

-- CreateIndex
CREATE INDEX "shortlists_jobPostId_appliedAt_idx" ON "shortlists"("jobPostId", "appliedAt" DESC);

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_evaluationLinkId_fkey" FOREIGN KEY ("evaluationLinkId") REFERENCES "evaluation_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_links" ADD CONSTRAINT "evaluation_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hire_outcomes" ADD CONSTRAINT "hire_outcomes_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
