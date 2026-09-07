-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'INCOMPLETE', 'UNUSABLE', 'PENDING_INSPECTION');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'RETURNED', 'INSPECTION', 'REPAIR', 'DAMAGED', 'LOST', 'DISPOSED');

-- CreateEnum
CREATE TYPE "InventoryAcquisitionSource" AS ENUM ('PURCHASE_ORDER', 'BUYBACK');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE_RECEIVED', 'RESERVED', 'RELEASED', 'SOLD', 'RETURNED', 'BUYBACK_RECEIVED', 'INSPECTION_ACCEPTED', 'INSPECTION_REJECTED', 'ADJUSTMENT', 'DAMAGED', 'LOST');

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "inventoryItemId" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "condition" "Condition" NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "locationId" TEXT NOT NULL,
    "acquisitionSource" "InventoryAcquisitionSource" NOT NULL DEFAULT 'PURCHASE_ORDER',
    "costBasisMinor" INTEGER,
    "conditionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "fromStatus" "InventoryStatus",
    "toStatus" "InventoryStatus" NOT NULL,
    "actorId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_code_key" ON "InventoryLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_serial_key" ON "InventoryItem"("serial");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE INDEX "InventoryItem_productVariantId_idx" ON "InventoryItem"("productVariantId");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_idx" ON "InventoryMovement"("itemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- CreateIndex
CREATE INDEX "ProductImage_inventoryItemId_idx" ON "ProductImage"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint (hand-added, DATABASE.md §4/§6): a ProductImage
-- belongs to exactly one owner - the Product (NEW-condition marketing
-- photos) or a specific InventoryItem (a USED unit's real photos) -
-- never both, never neither. Prisma has no portable declarative XOR
-- constraint, so this is defense-in-depth added directly in SQL rather
-- than relying on application code alone (brief §12: "ne compte pas
-- uniquement sur les validations TypeScript").
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_owner_xor_check" CHECK (
  ("productId" IS NOT NULL AND "inventoryItemId" IS NULL) OR
  ("productId" IS NULL AND "inventoryItemId" IS NOT NULL)
);
