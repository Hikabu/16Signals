/*
  Warnings:

  - The values [PENDING,IN_PROGRESS,RUNNING,DONE,FAILED] on the enum `SyncStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SyncStatus_new" AS ENUM ('NOT_SYNCED', 'CONNECT_REQUEST', 'CONNECT_SUCCESS', 'SYNC_REQUEST', 'SYNC_FETCH_REQUEST', 'SYNC_FETCH_SUCCESS', 'SYNC_SUCCESS', 'SYNC_FAILED');
ALTER TABLE "public"."GithubProfile" ALTER COLUMN "syncStatus" DROP DEFAULT;
ALTER TABLE "GithubProfile" ALTER COLUMN "syncStatus" TYPE "SyncStatus_new" USING ("syncStatus"::text::"SyncStatus_new");
ALTER TYPE "SyncStatus" RENAME TO "SyncStatus_old";
ALTER TYPE "SyncStatus_new" RENAME TO "SyncStatus";
DROP TYPE "public"."SyncStatus_old";
ALTER TABLE "GithubProfile" ALTER COLUMN "syncStatus" SET DEFAULT 'NOT_SYNCED';
COMMIT;

-- AlterTable
ALTER TABLE "GithubProfile" ALTER COLUMN "syncStatus" SET DEFAULT 'NOT_SYNCED';
