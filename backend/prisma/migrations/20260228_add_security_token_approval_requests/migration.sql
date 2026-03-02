-- CreateTable
CREATE TABLE IF NOT EXISTS "SecurityTokenApprovalRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requesterEmail" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "tokenName" TEXT NOT NULL,
  "tokenSymbol" TEXT NOT NULL,
  "decimals" INTEGER NOT NULL,
  "totalSupply" TEXT NOT NULL,
  "maxTotalSupply" TEXT NOT NULL,
  "minTimelockAmount" TEXT NOT NULL,
  "maxReleaseDelayDays" INTEGER NOT NULL,
  "originalValue" TEXT NOT NULL,
  "documentHash" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "hashSource" TEXT NOT NULL,
  "fileName" TEXT,
  "fileMimeType" TEXT,
  "requestFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityTokenApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SecurityTokenApprovalActionToken" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityTokenApprovalActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityTokenApprovalRequest_userId_requestFingerprint_idx"
  ON "SecurityTokenApprovalRequest"("userId", "requestFingerprint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityTokenApprovalRequest_status_idx"
  ON "SecurityTokenApprovalRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityTokenApprovalRequest_documentHash_idx"
  ON "SecurityTokenApprovalRequest"("documentHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SecurityTokenApprovalActionToken_token_key"
  ON "SecurityTokenApprovalActionToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityTokenApprovalActionToken_token_idx"
  ON "SecurityTokenApprovalActionToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityTokenApprovalActionToken_requestId_idx"
  ON "SecurityTokenApprovalActionToken"("requestId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SecurityTokenApprovalRequest_userId_fkey'
  ) THEN
    ALTER TABLE "SecurityTokenApprovalRequest"
      ADD CONSTRAINT "SecurityTokenApprovalRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SecurityTokenApprovalActionToken_requestId_fkey'
  ) THEN
    ALTER TABLE "SecurityTokenApprovalActionToken"
      ADD CONSTRAINT "SecurityTokenApprovalActionToken_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "SecurityTokenApprovalRequest"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
