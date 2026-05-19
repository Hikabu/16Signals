/*
  Warnings:

  - You are about to drop the column `userId` on the `analysis_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `shortlists` table. All the data in the column will be lost.
  - You are about to drop the `AuthAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CachedResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Candidate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeveloperCandidate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GithubProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Vouch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Web3Profile` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `companies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `job_posts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `shortlists` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AuthAccount" DROP CONSTRAINT "AuthAccount_userId_fkey";

-- DropForeignKey
ALTER TABLE "Candidate" DROP CONSTRAINT "Candidate_userId_fkey";

-- DropForeignKey
ALTER TABLE "DeveloperCandidate" DROP CONSTRAINT "DeveloperCandidate_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "GithubProfile" DROP CONSTRAINT "GithubProfile_devCandidateId_fkey";

-- DropForeignKey
ALTER TABLE "GithubProfile" DROP CONSTRAINT "GithubProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "Vouch" DROP CONSTRAINT "Vouch_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "Web3Profile" DROP CONSTRAINT "Web3Profile_devCandidateId_fkey";

-- DropForeignKey
ALTER TABLE "Web3Profile" DROP CONSTRAINT "Web3Profile_userId_fkey";

-- DropForeignKey
ALTER TABLE "analysis_jobs" DROP CONSTRAINT "analysis_jobs_userId_fkey";

-- DropForeignKey
ALTER TABLE "shortlists" DROP CONSTRAINT "shortlists_candidateId_fkey";

-- AlterTable
ALTER TABLE "analysis_jobs" DROP COLUMN "userId",
ADD COLUMN     "candidateId" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "shortlists" DROP COLUMN "createdAt",
DROP COLUMN "notes",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "AuthAccount";

-- DropTable
DROP TABLE "CachedResult";

-- DropTable
DROP TABLE "Candidate";

-- DropTable
DROP TABLE "DeveloperCandidate";

-- DropTable
DROP TABLE "GithubProfile";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "Vouch";

-- DropTable
DROP TABLE "Web3Profile";

-- CreateTable
CREATE TABLE "users" (
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

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" VARCHAR(500),
    "location" VARCHAR(255),
    "website" VARCHAR(255),
    "careerPath" INTEGER NOT NULL DEFAULT 1,
    "scorecard" JSONB,
    "generateCooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_profiles" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "githubCooldownUntil" TIMESTAMP(3),
    "walletCooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_profiles" (
    "id" TEXT NOT NULL,
    "developerProfileId" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "syncProgress" TEXT NOT NULL DEFAULT '0',
    "syncError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "rawDataSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web3_profiles" (
    "id" TEXT NOT NULL,
    "developerProfileId" TEXT NOT NULL,
    "solanaAddress" TEXT,
    "verifiedContracts" JSONB,
    "onChainMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web3_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouches" (
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

    CONSTRAINT "vouches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_results" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cached_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_providerId_key" ON "auth_accounts"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_userId_key" ON "candidates"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "developer_profiles_candidateId_key" ON "developer_profiles"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "github_profiles_developerProfileId_key" ON "github_profiles"("developerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "github_profiles_githubUsername_key" ON "github_profiles"("githubUsername");

-- CreateIndex
CREATE UNIQUE INDEX "github_profiles_githubUserId_key" ON "github_profiles"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "web3_profiles_developerProfileId_key" ON "web3_profiles"("developerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "vouches_txSignature_key" ON "vouches"("txSignature");

-- CreateIndex
CREATE INDEX "vouches_candidateId_isActive_expiresAt_idx" ON "vouches"("candidateId", "isActive", "expiresAt");

-- CreateIndex
CREATE INDEX "vouches_voucherWallet_isActive_expiresAt_idx" ON "vouches"("voucherWallet", "isActive", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "vouches_candidateId_voucherWallet_key" ON "vouches"("candidateId", "voucherWallet");

-- CreateIndex
CREATE UNIQUE INDEX "cached_results_cacheKey_key" ON "cached_results"("cacheKey");

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_profiles" ADD CONSTRAINT "github_profiles_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web3_profiles" ADD CONSTRAINT "web3_profiles_developerProfileId_fkey" FOREIGN KEY ("developerProfileId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouches" ADD CONSTRAINT "vouches_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
