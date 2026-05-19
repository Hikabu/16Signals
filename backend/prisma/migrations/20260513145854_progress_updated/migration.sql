/*
  Warnings:

  - The `syncProgress` column on the `github_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "github_profiles" DROP COLUMN "syncProgress",
ADD COLUMN     "syncProgress" INTEGER NOT NULL DEFAULT 0;
