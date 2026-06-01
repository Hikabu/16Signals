/*
  Warnings:

  - You are about to drop the column `candidateId` on the `analysis_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `scorecard` on the `candidates` table. All the data in the column will be lost.
  - Added the required column `githubProfileId` to the `analysis_jobs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AnalysisMode" AS ENUM ('LIGHT', 'DEEP');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('STRONG_EVIDENCE', 'MODERATE_EVIDENCE', 'LOW_EVIDENCE', 'OBSERVABILITY_GAP', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "PrimitiveType" AS ENUM ('EXECUTION_RELIABILITY', 'SYSTEMS_EVOLUTION', 'COLLABORATION_LEVERAGE', 'TECHNICAL_DEPTH', 'OPERATIONAL_MATURITY', 'AI_LEVERAGE_QUALITY', 'AUTHENTICITY_CONFIDENCE');

-- DropForeignKey
ALTER TABLE "analysis_jobs" DROP CONSTRAINT "analysis_jobs_candidateId_fkey";

-- AlterTable
ALTER TABLE "analysis_jobs" DROP COLUMN "candidateId",
ADD COLUMN     "githubProfileId" TEXT NOT NULL,
ADD COLUMN     "mode" "AnalysisMode" NOT NULL DEFAULT 'LIGHT';

-- AlterTable
ALTER TABLE "candidates" DROP COLUMN "scorecard";

-- AlterTable
ALTER TABLE "github_profiles" ADD COLUMN     "installationId" TEXT,
ADD COLUMN     "scorecard" JSONB,
ADD COLUMN     "scorecardUpdatedAt" TIMESTAMP(3),
ALTER COLUMN "developerProfileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "briefs" (
    "id" TEXT NOT NULL,
    "corpusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisConfig" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "analysisJson" JSONB NOT NULL,
    "pdfPath" TEXT,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus" (
    "id" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "groupsPresent" TEXT[],
    "collectionErrors" TEXT[],
    "identity" JSONB,
    "repositories" JSONB,
    "commitSignals" JSONB,
    "collaborationSignals" JSONB,
    "engineeringPracticeSignals" JSONB,
    "impactSignals" JSONB,
    "antiGamingInputs" JSONB,

    CONSTRAINT "corpus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_primitives" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "primitive" "PrimitiveType" NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_primitives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "unitCount" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "jobId" TEXT,
    "billedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corpus_expiresAt_idx" ON "corpus"("expiresAt");

-- CreateIndex
CREATE INDEX "corpus_githubUsername_idx" ON "corpus"("githubUsername");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_githubUsername_mode_key" ON "corpus"("githubUsername", "mode");

-- CreateIndex
CREATE INDEX "evidence_primitives_analysisJobId_idx" ON "evidence_primitives"("analysisJobId");

-- CreateIndex
CREATE INDEX "evidence_primitives_primitive_confidence_idx" ON "evidence_primitives"("primitive", "confidence");

-- CreateIndex
CREATE INDEX "usage_events_tenantId_createdAt_idx" ON "usage_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_events_billedAt_idx" ON "usage_events"("billedAt");

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_githubProfileId_fkey" FOREIGN KEY ("githubProfileId") REFERENCES "github_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "corpus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_primitives" ADD CONSTRAINT "evidence_primitives_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
