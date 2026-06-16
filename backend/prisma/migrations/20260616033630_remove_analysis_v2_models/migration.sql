/*
  Warnings:

  - You are about to drop the column `isVerified` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `isVerifiedPayer` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `privyId` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `smartAccountAddress` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `totalEscrowsFunded` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `totalEscrowsReleased` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `totalJobsPosted` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `trustScore` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `verifiedAt` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `walletAddress` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `needsOtherRoleTools` on the `employer_waitlist` table. All the data in the column will be lost.
  - You are about to drop the column `otherRolesText` on the `employer_waitlist` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `analysis_jobs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `briefs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `candidate_interested_waitlist` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `corpus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `employer_launch_waitlist` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `evidence_primitives` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `job_posts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shortlists` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vouches` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "analysis_jobs" DROP CONSTRAINT "analysis_jobs_githubProfileId_fkey";

-- DropForeignKey
ALTER TABLE "briefs" DROP CONSTRAINT "briefs_corpusId_fkey";

-- DropForeignKey
ALTER TABLE "evidence_primitives" DROP CONSTRAINT "evidence_primitives_analysisJobId_fkey";

-- DropForeignKey
ALTER TABLE "job_posts" DROP CONSTRAINT "job_posts_companyId_fkey";

-- DropForeignKey
ALTER TABLE "shortlists" DROP CONSTRAINT "shortlists_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "shortlists" DROP CONSTRAINT "shortlists_jobPostId_fkey";

-- DropForeignKey
ALTER TABLE "vouches" DROP CONSTRAINT "vouches_candidateId_fkey";

-- DropIndex
DROP INDEX "companies_privyId_key";

-- DropIndex
DROP INDEX "companies_smartAccountAddress_key";

-- DropIndex
DROP INDEX "companies_walletAddress_key";

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "isVerified",
DROP COLUMN "isVerifiedPayer",
DROP COLUMN "privyId",
DROP COLUMN "smartAccountAddress",
DROP COLUMN "totalEscrowsFunded",
DROP COLUMN "totalEscrowsReleased",
DROP COLUMN "totalJobsPosted",
DROP COLUMN "trustScore",
DROP COLUMN "verifiedAt",
DROP COLUMN "walletAddress";

-- AlterTable
ALTER TABLE "employer_waitlist" DROP COLUMN "needsOtherRoleTools",
DROP COLUMN "otherRolesText";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "name";

-- DropTable
DROP TABLE "analysis_jobs";

-- DropTable
DROP TABLE "briefs";

-- DropTable
DROP TABLE "candidate_interested_waitlist";

-- DropTable
DROP TABLE "corpus";

-- DropTable
DROP TABLE "employer_launch_waitlist";

-- DropTable
DROP TABLE "evidence_primitives";

-- DropTable
DROP TABLE "job_posts";

-- DropTable
DROP TABLE "shortlists";

-- DropTable
DROP TABLE "vouches";

-- DropEnum
DROP TYPE "AnalysisMode";

-- DropEnum
DROP TYPE "BehaviorPattern";

-- DropEnum
DROP TYPE "ConfidenceLevel";

-- DropEnum
DROP TYPE "ConfidenceTier";

-- DropEnum
DROP TYPE "EscrowStatus";

-- DropEnum
DROP TYPE "FitTier";

-- DropEnum
DROP TYPE "FraudTier";

-- DropEnum
DROP TYPE "JobStatus";

-- DropEnum
DROP TYPE "PipelineStage";

-- DropEnum
DROP TYPE "PrimitiveType";

-- DropEnum
DROP TYPE "RiskLevel";

-- DropEnum
DROP TYPE "RoleType";

-- DropEnum
DROP TYPE "Seniority";

-- DropEnum
DROP TYPE "ShortlistStatus";
