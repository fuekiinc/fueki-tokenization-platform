CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash any legacy raw bearer tokens in place so database rows stop being directly reusable.
UPDATE "Session"
SET "refreshToken" = CASE
  WHEN "refreshToken" ~ '^[0-9a-f]{64}$' THEN "refreshToken"
  ELSE encode(digest("refreshToken", 'sha256'), 'hex')
END
WHERE "refreshToken" IS NOT NULL;

UPDATE "PasswordResetToken"
SET "token" = CASE
  WHEN "token" ~ '^[0-9a-f]{64}$' THEN "token"
  ELSE encode(digest("token", 'sha256'), 'hex')
END
WHERE "token" IS NOT NULL;

UPDATE "AdminActionToken"
SET "token" = CASE
  WHEN "token" ~ '^[0-9a-f]{64}$' THEN "token"
  ELSE encode(digest("token", 'sha256'), 'hex')
END
WHERE "token" IS NOT NULL;

UPDATE "MintApprovalActionToken"
SET "token" = CASE
  WHEN "token" ~ '^[0-9a-f]{64}$' THEN "token"
  ELSE encode(digest("token", 'sha256'), 'hex')
END
WHERE "token" IS NOT NULL;

UPDATE "SecurityTokenApprovalActionToken"
SET "token" = CASE
  WHEN "token" ~ '^[0-9a-f]{64}$' THEN "token"
  ELSE encode(digest("token", 'sha256'), 'hex')
END
WHERE "token" IS NOT NULL;
