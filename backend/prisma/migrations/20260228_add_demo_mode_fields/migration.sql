-- Add demo mode fields to User table
ALTER TABLE "User" ADD COLUMN "demoUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "demoActive" BOOLEAN NOT NULL DEFAULT false;
