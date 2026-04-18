-- CreateTable
CREATE TABLE "UserWalletConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletAddress" VARCHAR(42) NOT NULL,
  "firstConnectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastConnectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectionCount" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "UserWalletConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserWalletConnection_userId_walletAddress_key"
  ON "UserWalletConnection"("userId", "walletAddress");

-- CreateIndex
CREATE INDEX "UserWalletConnection_userId_idx"
  ON "UserWalletConnection"("userId");

-- CreateIndex
CREATE INDEX "UserWalletConnection_walletAddress_idx"
  ON "UserWalletConnection"("walletAddress");

-- CreateIndex
CREATE INDEX "UserWalletConnection_userId_lastConnectedAt_idx"
  ON "UserWalletConnection"("userId", "lastConnectedAt");

-- Backfill already-linked current wallets so admins can see existing data
-- immediately after deploy. Historical timestamps are inferred from the
-- current user record because exact legacy connect events were not stored.
INSERT INTO "UserWalletConnection" (
  "id",
  "userId",
  "walletAddress",
  "firstConnectedAt",
  "lastConnectedAt",
  "connectionCount"
)
SELECT
  md5("id" || ':' || lower("walletAddress") || ':' || clock_timestamp()::text),
  "id",
  lower("walletAddress"),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  GREATEST(COALESCE("updatedAt", CURRENT_TIMESTAMP), COALESCE("createdAt", CURRENT_TIMESTAMP)),
  1
FROM "User"
WHERE "walletAddress" IS NOT NULL
  AND length(trim("walletAddress")) > 0
ON CONFLICT ("userId", "walletAddress") DO NOTHING;

-- AddForeignKey
ALTER TABLE "UserWalletConnection"
  ADD CONSTRAINT "UserWalletConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
