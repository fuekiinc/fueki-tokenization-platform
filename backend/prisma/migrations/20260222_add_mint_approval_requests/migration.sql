-- CreateTable
CREATE TABLE IF NOT EXISTS "MintApprovalRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requesterEmail" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "tokenName" TEXT NOT NULL,
  "tokenSymbol" TEXT NOT NULL,
  "mintAmount" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "documentHash" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "originalValue" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileMimeType" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MintApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MintApprovalActionToken" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MintApprovalActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MintApprovalRequest_userId_requestFingerprint_idx"
  ON "MintApprovalRequest"("userId", "requestFingerprint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MintApprovalRequest_status_idx"
  ON "MintApprovalRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MintApprovalRequest_documentHash_idx"
  ON "MintApprovalRequest"("documentHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MintApprovalActionToken_token_key"
  ON "MintApprovalActionToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MintApprovalActionToken_token_idx"
  ON "MintApprovalActionToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MintApprovalActionToken_requestId_idx"
  ON "MintApprovalActionToken"("requestId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MintApprovalRequest_userId_fkey'
  ) THEN
    ALTER TABLE "MintApprovalRequest"
      ADD CONSTRAINT "MintApprovalRequest_userId_fkey"
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
    WHERE conname = 'MintApprovalActionToken_requestId_fkey'
  ) THEN
    ALTER TABLE "MintApprovalActionToken"
      ADD CONSTRAINT "MintApprovalActionToken_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "MintApprovalRequest"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
