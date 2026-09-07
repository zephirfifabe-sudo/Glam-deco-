-- AlterTable
ALTER TABLE "BuybackRequest" ADD COLUMN     "valuationApprovedById" TEXT;

-- AddForeignKey
ALTER TABLE "BuybackRequest" ADD CONSTRAINT "BuybackRequest_valuationApprovedById_fkey" FOREIGN KEY ("valuationApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
