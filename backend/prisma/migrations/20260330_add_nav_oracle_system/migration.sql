DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'NavAttestationStatus'
  ) THEN
    CREATE TYPE "NavAttestationStatus" AS ENUM (
      'DRAFT',
      'PENDING_TX',
      'PUBLISHED',
      'SUPERSEDED',
      'DISPUTED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "NavOracleRegistration" (
  "id" TEXT NOT NULL,
  "tokenAddress" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "oracleAddress" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "stalenessWarningDays" INTEGER NOT NULL DEFAULT 90,
  "stalenessCriticalDays" INTEGER NOT NULL DEFAULT 180,
  "minAttestationIntervalSeconds" INTEGER NOT NULL DEFAULT 86400,
  "maxNavChangeBps" INTEGER NOT NULL DEFAULT 5000,
  "lastIndexedBlock" BIGINT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NavOracleRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NavAttestation" (
  "id" TEXT NOT NULL,
  "tokenAddress" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "oracleAddress" TEXT NOT NULL,
  "navPerToken" DECIMAL(36,6) NOT NULL,
  "totalNAV" DECIMAL(36,6) NOT NULL,
  "totalTokenSupply" DECIMAL(36,0) NOT NULL,
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publisherAddress" TEXT NOT NULL,
  "publisherName" TEXT,
  "reportHash" TEXT NOT NULL,
  "reportURI" TEXT NOT NULL,
  "txHash" TEXT,
  "attestationIndex" INTEGER,
  "indexedBlockNumber" BIGINT,
  "status" "NavAttestationStatus" NOT NULL DEFAULT 'PUBLISHED',
  CONSTRAINT "NavAttestation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NavAssetSnapshot" (
  "id" TEXT NOT NULL,
  "attestationId" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "grossAssetValue" DECIMAL(36,6) NOT NULL,
  "liabilities" DECIMAL(36,6) NOT NULL DEFAULT 0,
  "netAssetValue" DECIMAL(36,6) NOT NULL,
  "provenReservesOz" DECIMAL(36,6),
  "probableReservesOz" DECIMAL(36,6),
  "spotPricePerOz" DECIMAL(36,6),
  "productionRateTpd" DECIMAL(36,6),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NavAssetSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NavPublisher" (
  "id" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "licenseNumber" TEXT,
  "licenseType" TEXT,
  "contactEmail" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "addedBy" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NavPublisher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NavPublisherAssignment" (
  "id" TEXT NOT NULL,
  "tokenAddress" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "addedBy" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  CONSTRAINT "NavPublisherAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NavOracleRegistration_tokenAddress_chainId_key"
  ON "NavOracleRegistration"("tokenAddress", "chainId");

CREATE UNIQUE INDEX IF NOT EXISTS "NavOracleRegistration_oracleAddress_chainId_key"
  ON "NavOracleRegistration"("oracleAddress", "chainId");

CREATE INDEX IF NOT EXISTS "NavOracleRegistration_chainId_idx"
  ON "NavOracleRegistration"("chainId");

CREATE UNIQUE INDEX IF NOT EXISTS "NavAttestation_tokenAddress_chainId_attestationIndex_key"
  ON "NavAttestation"("tokenAddress", "chainId", "attestationIndex");

CREATE INDEX IF NOT EXISTS "NavAttestation_tokenAddress_chainId_effectiveDate_idx"
  ON "NavAttestation"("tokenAddress", "chainId", "effectiveDate" DESC);

CREATE INDEX IF NOT EXISTS "NavAttestation_publisherAddress_idx"
  ON "NavAttestation"("publisherAddress");

CREATE INDEX IF NOT EXISTS "NavAttestation_txHash_idx"
  ON "NavAttestation"("txHash");

CREATE INDEX IF NOT EXISTS "NavAssetSnapshot_attestationId_idx"
  ON "NavAssetSnapshot"("attestationId");

CREATE UNIQUE INDEX IF NOT EXISTS "NavPublisher_walletAddress_key"
  ON "NavPublisher"("walletAddress");

CREATE INDEX IF NOT EXISTS "NavPublisher_isActive_idx"
  ON "NavPublisher"("isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "NavPublisherAssignment_tokenAddress_chainId_walletAddress_key"
  ON "NavPublisherAssignment"("tokenAddress", "chainId", "walletAddress");

CREATE INDEX IF NOT EXISTS "NavPublisherAssignment_walletAddress_idx"
  ON "NavPublisherAssignment"("walletAddress");

CREATE INDEX IF NOT EXISTS "NavPublisherAssignment_tokenAddress_chainId_isActive_idx"
  ON "NavPublisherAssignment"("tokenAddress", "chainId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'NavAttestation_tokenAddress_chainId_fkey'
  ) THEN
    ALTER TABLE "NavAttestation"
      ADD CONSTRAINT "NavAttestation_tokenAddress_chainId_fkey"
      FOREIGN KEY ("tokenAddress", "chainId")
      REFERENCES "NavOracleRegistration"("tokenAddress", "chainId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'NavAssetSnapshot_attestationId_fkey'
  ) THEN
    ALTER TABLE "NavAssetSnapshot"
      ADD CONSTRAINT "NavAssetSnapshot_attestationId_fkey"
      FOREIGN KEY ("attestationId")
      REFERENCES "NavAttestation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'NavPublisherAssignment_tokenAddress_chainId_fkey'
  ) THEN
    ALTER TABLE "NavPublisherAssignment"
      ADD CONSTRAINT "NavPublisherAssignment_tokenAddress_chainId_fkey"
      FOREIGN KEY ("tokenAddress", "chainId")
      REFERENCES "NavOracleRegistration"("tokenAddress", "chainId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'NavPublisherAssignment_walletAddress_fkey'
  ) THEN
    ALTER TABLE "NavPublisherAssignment"
      ADD CONSTRAINT "NavPublisherAssignment_walletAddress_fkey"
      FOREIGN KEY ("walletAddress")
      REFERENCES "NavPublisher"("walletAddress")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
