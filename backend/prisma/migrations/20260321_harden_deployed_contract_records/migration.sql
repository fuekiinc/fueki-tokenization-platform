DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ContractTemplateType'
  ) THEN
    CREATE TYPE "ContractTemplateType" AS ENUM (
      'ERC20',
      'ERC721',
      'ERC1155',
      'ERC1404',
      'STAKING',
      'AUCTION',
      'ESCROW',
      'SPLITTER',
      'LOTTERY',
      'CUSTOM'
    );
  END IF;
END $$;

ALTER TABLE "DeployedContract"
  ADD COLUMN IF NOT EXISTS "contractName" TEXT,
  ADD COLUMN IF NOT EXISTS "templateType" "ContractTemplateType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN IF NOT EXISTS "walletAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceCode" TEXT,
  ADD COLUMN IF NOT EXISTS "compilationWarnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "DeployedContract"
  ALTER COLUMN "constructorArgs" DROP NOT NULL,
  ALTER COLUMN "constructorArgs" DROP DEFAULT;

ALTER TABLE "DeployedContract"
  ALTER COLUMN "blockNumber" TYPE BIGINT USING "blockNumber"::BIGINT;

UPDATE "DeployedContract"
SET
  "contractAddress" = lower("contractAddress"),
  "deployerAddress" = lower("deployerAddress"),
  "walletAddress" = lower(COALESCE("walletAddress", "deployerAddress")),
  "txHash" = lower("txHash"),
  "contractName" = COALESCE(NULLIF("contractName", ''), "templateName"),
  "updatedAt" = COALESCE("updatedAt", "createdAt"),
  "templateType" = CASE
    WHEN lower(COALESCE("templateId", '')) LIKE '%1404%' THEN 'ERC1404'::"ContractTemplateType"
    WHEN lower(COALESCE("templateId", '')) LIKE '%1155%' THEN 'ERC1155'::"ContractTemplateType"
    WHEN lower(COALESCE("templateId", '')) LIKE '%721%'
      OR lower(COALESCE("templateName", '')) LIKE '%nft%' THEN 'ERC721'::"ContractTemplateType"
    WHEN lower(COALESCE("templateId", '')) LIKE '%20%'
      OR lower(COALESCE("templateName", '')) LIKE '%token%' THEN 'ERC20'::"ContractTemplateType"
    WHEN lower(COALESCE("templateName", '')) LIKE '%staking%' THEN 'STAKING'::"ContractTemplateType"
    WHEN lower(COALESCE("templateName", '')) LIKE '%auction%' THEN 'AUCTION'::"ContractTemplateType"
    WHEN lower(COALESCE("templateName", '')) LIKE '%escrow%' THEN 'ESCROW'::"ContractTemplateType"
    WHEN lower(COALESCE("templateName", '')) LIKE '%split%' THEN 'SPLITTER'::"ContractTemplateType"
    WHEN lower(COALESCE("templateName", '')) LIKE '%lottery%' THEN 'LOTTERY'::"ContractTemplateType"
    ELSE COALESCE("templateType", 'CUSTOM'::"ContractTemplateType")
  END;

WITH ranked_by_tx AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY lower("txHash")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_num
  FROM "DeployedContract"
)
DELETE FROM "DeployedContract" target
USING ranked_by_tx ranked
WHERE target."id" = ranked."id"
  AND ranked.row_num > 1;

WITH ranked_by_address AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "chainId", lower("contractAddress")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_num
  FROM "DeployedContract"
)
DELETE FROM "DeployedContract" target
USING ranked_by_address ranked
WHERE target."id" = ranked."id"
  AND ranked.row_num > 1;

ALTER TABLE "DeployedContract"
  ALTER COLUMN "contractName" SET NOT NULL,
  ALTER COLUMN "walletAddress" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "DeployedContract_txHash_key"
  ON "DeployedContract"("txHash");

CREATE INDEX IF NOT EXISTS "DeployedContract_walletAddress_idx"
  ON "DeployedContract"("walletAddress");

CREATE INDEX IF NOT EXISTS "DeployedContract_walletAddress_chainId_idx"
  ON "DeployedContract"("walletAddress", "chainId");
