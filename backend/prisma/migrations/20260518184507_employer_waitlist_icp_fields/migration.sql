-- AlterTable
ALTER TABLE "employer_waitlist" ADD COLUMN     "needsOtherRoleTools" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otherRolesText" TEXT;
