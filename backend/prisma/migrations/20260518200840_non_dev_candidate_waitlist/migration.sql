/*
  Warnings:

  - You are about to drop the column `otherRoleType` on the `candidate_interested_waitlist` table. All the data in the column will be lost.
  - You are about to drop the column `roleType` on the `candidate_interested_waitlist` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `candidate_interested_waitlist` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "candidate_interested_waitlist" DROP COLUMN "otherRoleType",
DROP COLUMN "roleType",
DROP COLUMN "userId",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "otherRole" TEXT,
ADD COLUMN     "role" TEXT,
ALTER COLUMN "tools" DROP NOT NULL,
ALTER COLUMN "tools" DROP DEFAULT,
ALTER COLUMN "tools" SET DATA TYPE TEXT;
