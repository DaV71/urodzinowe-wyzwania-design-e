-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('LOCKED', 'ACTIVE', 'PENDING_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "Proof" AS ENUM ('PHOTO', 'PHOTO_OPTIONAL', 'NONE');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('MANUAL', 'CODE', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('PLAYER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proof" "Proof" NOT NULL,
    "proofHint" TEXT NOT NULL,
    "askDistance" BOOLEAN NOT NULL,
    "askDuration" BOOLEAN NOT NULL,
    "maxPhotos" INTEGER NOT NULL,
    "compareToTask" INTEGER,
    "minImprovementS" INTEGER,
    "minDistanceM" INTEGER,
    "maxDurationS" INTEGER,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProgress" (
    "taskId" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'LOCKED',
    "unlockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "source" "Source",
    "resultSeconds" INTEGER,
    "resultDistanceM" INTEGER,
    "lastRejectReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskProgress_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "note" TEXT,
    "photos" JSONB NOT NULL,
    "photoHashes" JSONB NOT NULL,
    "distanceM" INTEGER,
    "durationS" INTEGER,
    "warnings" JSONB NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeAttempt" (
    "id" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" "Actor" NOT NULL,
    "action" TEXT NOT NULL,
    "taskId" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "CodeAttempt_createdAt_idx" ON "CodeAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
