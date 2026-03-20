ALTER TABLE "MintApprovalRequest"
ADD COLUMN "requesterWalletAddress" TEXT;

CREATE INDEX "MintApprovalRequest_userId_requesterWalletAddress_requestFingerprint_idx"
ON "MintApprovalRequest"("userId", "requesterWalletAddress", "requestFingerprint");

CREATE INDEX "MintApprovalRequest_requesterWalletAddress_idx"
ON "MintApprovalRequest"("requesterWalletAddress");
