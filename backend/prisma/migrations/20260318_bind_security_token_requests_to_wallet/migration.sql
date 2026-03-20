ALTER TABLE "SecurityTokenApprovalRequest"
ADD COLUMN "requesterWalletAddress" TEXT;

CREATE INDEX "SecurityTokenApprovalRequest_userId_requesterWalletAddress_requestFingerprint_idx"
ON "SecurityTokenApprovalRequest"("userId", "requesterWalletAddress", "requestFingerprint");

CREATE INDEX "SecurityTokenApprovalRequest_requesterWalletAddress_idx"
ON "SecurityTokenApprovalRequest"("requesterWalletAddress");
