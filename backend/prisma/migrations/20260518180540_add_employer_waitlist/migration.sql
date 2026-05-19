-- CreateTable
CREATE TABLE "employer_waitlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT,
    "rolesHiring" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usesGithub" BOOLEAN NOT NULL DEFAULT false,
    "evalTools" TEXT,
    "companyTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "teamSize" TEXT,
    "socialLinks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_interested_waitlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleType" "RoleType",
    "otherRoleType" TEXT,
    "tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_interested_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employer_waitlist_email_key" ON "employer_waitlist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_interested_waitlist_email_key" ON "candidate_interested_waitlist"("email");
