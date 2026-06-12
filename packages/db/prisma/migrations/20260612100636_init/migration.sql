-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('WINNER', 'RUGGER', 'FRESH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('LIVE', 'CLEAN', 'RUG', 'DEAD');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('SCOUT', 'OPERATOR', 'SYNDICATE');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('CEX_CLEAN', 'UNVERIFIED', 'MIXER', 'LINKED_FLAGGED');

-- CreateEnum
CREATE TYPE "SnipeLvl" AS ENUM ('LOW', 'MED', 'HIGH');

-- CreateTable
CREATE TABLE "Dev" (
    "wallet" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "verdict" "Verdict" NOT NULL DEFAULT 'FRESH',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "launchCount" INTEGER NOT NULL DEFAULT 0,
    "rugCount" INTEGER NOT NULL DEFAULT 0,
    "cleanCount" INTEGER NOT NULL DEFAULT 0,
    "bestAthUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "medianLifespanS" INTEGER NOT NULL DEFAULT 0,
    "fundingType" "FundType" NOT NULL DEFAULT 'UNVERIFIED',
    "fundingPath" JSONB,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "backfilledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dev_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "Token" (
    "mint" TEXT NOT NULL,
    "devWallet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "venue" TEXT NOT NULL DEFAULT 'pumpfun',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "bundlePct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sniperLvl" "SnipeLvl" NOT NULL DEFAULT 'LOW',
    "drScore" INTEGER NOT NULL DEFAULT 50,
    "outcome" "Outcome" NOT NULL DEFAULT 'LIVE',
    "peakMcapUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lifespanS" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("mint")
);

-- CreateTable
CREATE TABLE "TokenSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mcapUsd" DECIMAL(65,30) NOT NULL,
    "liqUsd" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "TokenSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownAddress" (
    "address" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "KnownAddress_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "tier" "Tier" NOT NULL DEFAULT 'SCOUT',
    "tierExpires" TIMESTAMP(3),
    "tgChatId" TEXT,
    "tgLinkCode" TEXT,
    "alertPrefs" JSONB NOT NULL DEFAULT '{"winnerOnly":true}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watch" (
    "userId" TEXT NOT NULL,
    "devWallet" TEXT NOT NULL,

    CONSTRAINT "Watch_pkey" PRIMARY KEY ("userId","devWallet")
);

-- CreateTable
CREATE TABLE "Payment" (
    "signature" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amountSol" DECIMAL(65,30) NOT NULL,
    "tier" "Tier" NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("signature")
);

-- CreateTable
CREATE TABLE "PaymentUnmatched" (
    "signature" TEXT NOT NULL,
    "fromWallet" TEXT NOT NULL,
    "amountSol" DECIMAL(65,30) NOT NULL,
    "memo" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentUnmatched_pkey" PRIMARY KEY ("signature")
);

-- CreateIndex
CREATE INDEX "Token_createdAt_idx" ON "Token"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Token_devWallet_idx" ON "Token"("devWallet");

-- CreateIndex
CREATE INDEX "TokenSnapshot_mint_ts_idx" ON "TokenSnapshot"("mint", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "User_wallet_key" ON "User"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "User_tgChatId_key" ON "User"("tgChatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tgLinkCode_key" ON "User"("tgLinkCode");

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_devWallet_fkey" FOREIGN KEY ("devWallet") REFERENCES "Dev"("wallet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
