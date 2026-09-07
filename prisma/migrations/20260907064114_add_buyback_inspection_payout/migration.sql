-- CreateEnum
CREATE TYPE "BuybackStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PRE_ESTIMATE', 'AWAITING_SHIPMENT', 'RECEIVED', 'INSPECTION', 'VALUATION', 'CUSTOMER_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED', 'PAYOUT_PENDING', 'PAID', 'RECONDITIONING', 'AVAILABLE_FOR_RESALE');

-- CreateEnum
CREATE TYPE "BuybackItemStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'STRIPE');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "originBuybackItemId" TEXT;

-- CreateTable
CREATE TABLE "BuybackRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BuybackStatus" NOT NULL DEFAULT 'DRAFT',
    "addressId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuybackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuybackItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "declaredCondition" "Condition" NOT NULL,
    "declaredNotes" TEXT,
    "customerPhotos" TEXT[],
    "preEstimateMinMinor" INTEGER,
    "preEstimateMaxMinor" INTEGER,
    "status" "BuybackItemStatus" NOT NULL DEFAULT 'PENDING',
    "finalValueMinor" INTEGER,
    "rejectionReason" TEXT,
    "originalOrderItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuybackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuybackRule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "conditionMultipliers" JSONB NOT NULL,
    "seasonMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "demandMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "shippingCostMinor" INTEGER NOT NULL DEFAULT 0,
    "inspectionCostMinor" INTEGER NOT NULL DEFAULT 0,
    "cleaningCostMinor" INTEGER NOT NULL DEFAULT 0,
    "refurbishmentCostMinor" INTEGER NOT NULL DEFAULT 0,
    "storageCostMinor" INTEGER NOT NULL DEFAULT 0,
    "riskMarginRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "desiredMarginRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "minPayoutMinor" INTEGER NOT NULL DEFAULT 0,
    "maxPayoutMinor" INTEGER,
    "maxQuantityPerRequest" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuybackRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "buybackItemId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 1,
    "expectedQuantity" INTEGER NOT NULL DEFAULT 1,
    "declaredCondition" "Condition" NOT NULL,
    "observedCondition" "Condition" NOT NULL,
    "defects" TEXT[],
    "missingParts" TEXT[],
    "inspectionPhotos" TEXT[],
    "proposedValueMinor" INTEGER NOT NULL,
    "discrepancyFlag" BOOLEAN NOT NULL DEFAULT false,
    "discrepancyNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "buybackRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL,
    "method" "PayoutMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "destinationRef" TEXT,
    "preparedById" TEXT NOT NULL,
    "releasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutEvent" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "PayoutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScoreSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuybackRequest_userId_idx" ON "BuybackRequest"("userId");

-- CreateIndex
CREATE INDEX "BuybackRequest_status_idx" ON "BuybackRequest"("status");

-- CreateIndex
CREATE INDEX "BuybackItem_requestId_idx" ON "BuybackItem"("requestId");

-- CreateIndex
CREATE INDEX "BuybackItem_productVariantId_idx" ON "BuybackItem"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "BuybackRule_categoryId_key" ON "BuybackRule"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_buybackItemId_key" ON "Inspection"("buybackItemId");

-- CreateIndex
CREATE INDEX "Inspection_buybackItemId_idx" ON "Inspection"("buybackItemId");

-- CreateIndex
CREATE INDEX "Inspection_inspectorId_idx" ON "Inspection"("inspectorId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_buybackRequestId_key" ON "Payout"("buybackRequestId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "Payout_userId_idx" ON "Payout"("userId");

-- CreateIndex
CREATE INDEX "PayoutEvent_payoutId_idx" ON "PayoutEvent"("payoutId");

-- CreateIndex
CREATE INDEX "TrustScoreSnapshot_userId_idx" ON "TrustScoreSnapshot"("userId");

-- CreateIndex
CREATE INDEX "TrustScoreSnapshot_computedAt_idx" ON "TrustScoreSnapshot"("computedAt");

-- CreateIndex
CREATE INDEX "InventoryItem_originBuybackItemId_idx" ON "InventoryItem"("originBuybackItemId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_originBuybackItemId_fkey" FOREIGN KEY ("originBuybackItemId") REFERENCES "BuybackItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuybackRequest" ADD CONSTRAINT "BuybackRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuybackRequest" ADD CONSTRAINT "BuybackRequest_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuybackItem" ADD CONSTRAINT "BuybackItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BuybackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuybackItem" ADD CONSTRAINT "BuybackItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuybackItem" ADD CONSTRAINT "BuybackItem_originalOrderItemId_fkey" FOREIGN KEY ("originalOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuybackRule" ADD CONSTRAINT "BuybackRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_buybackItemId_fkey" FOREIGN KEY ("buybackItemId") REFERENCES "BuybackItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_buybackRequestId_fkey" FOREIGN KEY ("buybackRequestId") REFERENCES "BuybackRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEvent" ADD CONSTRAINT "PayoutEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScoreSnapshot" ADD CONSTRAINT "TrustScoreSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
