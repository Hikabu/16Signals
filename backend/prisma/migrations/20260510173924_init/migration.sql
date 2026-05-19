-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'CLOSED_PENDING', 'CLOSED');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'LEAD');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('BACKEND', 'FRONTEND', 'FULLSTACK', 'INFRASTRUCTURE', 'DATA_ML', 'SMART_CONTRACT', 'WEB3_BACKEND', 'WEB3_FRONTEND', 'WEB3_FULLSTACK', 'DEFI_PROTOCOL', 'SECURITY_WEB3', 'SECURITY', 'GENERALIST');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('UNFUNDED', 'FUNDED', 'RELEASED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FraudTier" AS ENUM ('CLEAN', 'FLAGGED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "ShortlistStatus" AS ENUM ('PENDING', 'REVIEWED', 'SHORTLISTED', 'CONTACTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "ConfidenceTier" AS ENUM ('FULL', 'PARTIAL', 'LOW', 'MINIMAL');

-- CreateEnum
CREATE TYPE "BehaviorPattern" AS ENUM ('REVIEW_HEAVY_SENIOR', 'COMMIT_HEAVY_MIDLEVEL', 'BALANCED_CONTRIBUTOR', 'OSS_COLLABORATOR', 'EARLY_CAREER', 'RETURNING_DEVELOPER', 'WEB3_SPECIALIST');

-- CreateEnum
CREATE TYPE "FitTier" AS ENUM ('STRONG', 'PROBE', 'PASS');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('APPLIED', 'REVIEWED', 'SHORTLISTED', 'INTERVIEW_HR', 'INTERVIEW_TECHNICAL', 'INTERVIEW_FINAL', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CANDIDATE', 'HR', 'HR_ADMIN', 'ORG_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GITHUB', 'GOOGLE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "description" TEXT,
    "registrationNumber" TEXT,
    "country" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "totalJobsPosted" INTEGER NOT NULL DEFAULT 0,
    "totalEscrowsFunded" INTEGER NOT NULL DEFAULT 0,
    "totalEscrowsReleased" INTEGER NOT NULL DEFAULT 0,
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "isVerifiedPayer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "walletAddress" TEXT,
    "smartAccountAddress" TEXT,
    "privyId" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_posts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "employmentType" TEXT,
    "bonusAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "roleType" "RoleType",
    "seniorityLevel" "Seniority",
    "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escrowId" BIGINT,
    "escrowAddress" TEXT,
    "candidateWallet" TEXT,
    "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'UNFUNDED',
    "escrowFundedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedRequirements" JSONB,
    "dynamicWeights" JSONB,
    "isWeb3Role" BOOLEAN NOT NULL DEFAULT false,
    "requirementsConfirmedAt" TIMESTAMP(3),

    CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "ShortlistStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleFitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fraudTier" "FraudTier" NOT NULL DEFAULT 'CLEAN',
    "riskLevel" "RiskLevel",
    "confidenceTier" "ConfidenceTier",
    "behaviorPattern" "BehaviorPattern",
    "fitTier" "FitTier" NOT NULL DEFAULT 'PASS',
    "candidateNote" VARCHAR(280),
    "hrNotes" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenScorecard" JSONB,
    "decisionCard" JSONB,
    "gapReport" JSONB,
    "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'APPLIED',
    "pipelineStageHistory" JSONB,
    "interviewQuestions" JSONB,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CANDIDATE',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" VARCHAR(500),
    "location" VARCHAR(255),
    "website" VARCHAR(255),
    "careerPath" INTEGER NOT NULL DEFAULT 1,
    "githubCooldownUntil" TIMESTAMP(3),
    "walletCooldownUntil" TIMESTAMP(3),
    "generateCooldownUntil" TIMESTAMP(3),
    "scorecard" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperCandidate" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubProfile" (
    "id" TEXT NOT NULL,
    "devCandidateId" TEXT NOT NULL,
    "userId" TEXT,
    "githubUsername" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncProgress" TEXT NOT NULL DEFAULT '0',
    "syncError" TEXT,
    "rawDataSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Web3Profile" (
    "id" TEXT NOT NULL,
    "devCandidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solanaAddress" TEXT,
    "verifiedContracts" JSONB,
    "onChainMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Web3Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vouch" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "voucherWallet" TEXT NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "txSignature" TEXT NOT NULL,
    "weight" TEXT NOT NULL DEFAULT 'standard',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "flag" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Vouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedResult" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachedResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_registrationNumber_key" ON "companies"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "companies_email_key" ON "companies"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_walletAddress_key" ON "companies"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "companies_smartAccountAddress_key" ON "companies"("smartAccountAddress");

-- CreateIndex
CREATE UNIQUE INDEX "companies_privyId_key" ON "companies"("privyId");

-- CreateIndex
CREATE UNIQUE INDEX "job_posts_escrowId_key" ON "job_posts"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "job_posts_escrowAddress_key" ON "job_posts"("escrowAddress");

-- CreateIndex
CREATE INDEX "job_posts_companyId_status_roleType_idx" ON "job_posts"("companyId", "status", "roleType");

-- CreateIndex
CREATE INDEX "shortlists_jobPostId_roleFitScore_idx" ON "shortlists"("jobPostId", "roleFitScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_jobPostId_candidateId_key" ON "shortlists"("jobPostId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerId_key" ON "AuthAccount"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_userId_key" ON "Candidate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperCandidate_candidateId_key" ON "DeveloperCandidate"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubProfile_devCandidateId_key" ON "GithubProfile"("devCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubProfile_userId_key" ON "GithubProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubProfile_githubUsername_key" ON "GithubProfile"("githubUsername");

-- CreateIndex
CREATE UNIQUE INDEX "GithubProfile_githubUserId_key" ON "GithubProfile"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Web3Profile_devCandidateId_key" ON "Web3Profile"("devCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Web3Profile_userId_key" ON "Web3Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vouch_txSignature_key" ON "Vouch"("txSignature");

-- CreateIndex
CREATE INDEX "Vouch_candidateId_isActive_expiresAt_idx" ON "Vouch"("candidateId", "isActive", "expiresAt");

-- CreateIndex
CREATE INDEX "Vouch_voucherWallet_isActive_expiresAt_idx" ON "Vouch"("voucherWallet", "isActive", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vouch_candidateId_voucherWallet_key" ON "Vouch"("candidateId", "voucherWallet");

-- CreateIndex
CREATE UNIQUE INDEX "CachedResult_cacheKey_key" ON "CachedResult"("cacheKey");

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperCandidate" ADD CONSTRAINT "DeveloperCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubProfile" ADD CONSTRAINT "GithubProfile_devCandidateId_fkey" FOREIGN KEY ("devCandidateId") REFERENCES "DeveloperCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubProfile" ADD CONSTRAINT "GithubProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Web3Profile" ADD CONSTRAINT "Web3Profile_devCandidateId_fkey" FOREIGN KEY ("devCandidateId") REFERENCES "DeveloperCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Web3Profile" ADD CONSTRAINT "Web3Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
