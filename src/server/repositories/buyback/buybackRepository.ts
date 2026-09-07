import { prisma } from "@/lib/db/client";
import type { BuybackStatus, Condition, Prisma } from "@prisma/client";

// Only server/repositories/** may import @prisma/client (ARCHITECTURE.md §2).

type Tx = Prisma.TransactionClient;

const REQUEST_DETAIL_INCLUDE = {
  items: {
    include: {
      productVariant: { include: { product: true } },
      inspection: true,
    },
  },
  payout: true,
} satisfies Prisma.BuybackRequestInclude;

export type BuybackRequestWithDetails = Prisma.BuybackRequestGetPayload<{
  include: typeof REQUEST_DETAIL_INCLUDE;
}>;

const ITEM_DETAIL_INCLUDE = {
  request: true,
  productVariant: { include: { product: { include: { category: true } } } },
  inspection: true,
} satisfies Prisma.BuybackItemInclude;

export type BuybackItemWithDetails = Prisma.BuybackItemGetPayload<{
  include: typeof ITEM_DETAIL_INCLUDE;
}>;

export async function findVariantForEligibility(productVariantId: string) {
  return prisma.productVariant.findUnique({
    where: { id: productVariantId },
    include: { product: { include: { category: true } } },
  });
}

/** BuybackRule.categoryId is unique - one rule per category (BUYBACK.md §3). */
export async function findActiveRuleForCategory(categoryId: string) {
  const rule = await prisma.buybackRule.findUnique({ where: { categoryId } });
  return rule && rule.active ? rule : null;
}

/**
 * IDOR guard baked into the query itself (THREAT_MODEL.md §2): only
 * returns a price if `orderItemId` really belongs to an order owned by
 * `userId` - a customer can never use someone else's purchase to
 * inflate their originalPrice input.
 */
export async function findOwnedOrderItemUnitPrice(
  orderItemId: string,
  userId: string,
): Promise<number | null> {
  const item = await prisma.orderItem.findFirst({
    where: { id: orderItemId, order: { userId } },
    select: { unitPriceMinor: true },
  });
  return item?.unitPriceMinor ?? null;
}

export interface NewBuybackItemInput {
  productVariantId: string;
  declaredCondition: Condition;
  declaredNotes: string | null;
  customerPhotos: string[];
  originalOrderItemId: string | null;
  preEstimateMinMinor: number;
  preEstimateMaxMinor: number;
}

export async function createRequestWithItemsInTx(
  tx: Tx,
  userId: string,
  addressId: string | null,
  items: NewBuybackItemInput[],
): Promise<BuybackRequestWithDetails> {
  return tx.buybackRequest.create({
    data: {
      userId,
      addressId,
      items: { create: items },
    },
    include: REQUEST_DETAIL_INCLUDE,
  });
}

export async function updateRequestStatusInTx(
  tx: Tx,
  id: string,
  status: BuybackStatus,
  extra: Prisma.BuybackRequestUpdateInput = {},
) {
  return tx.buybackRequest.update({
    where: { id },
    data: { status, ...extra },
  });
}

export async function findRequestById(
  id: string,
): Promise<BuybackRequestWithDetails | null> {
  return prisma.buybackRequest.findUnique({
    where: { id },
    include: REQUEST_DETAIL_INCLUDE,
  });
}

export async function findRequestByIdInTx(
  tx: Tx,
  id: string,
): Promise<BuybackRequestWithDetails> {
  return tx.buybackRequest.findUniqueOrThrow({
    where: { id },
    include: REQUEST_DETAIL_INCLUDE,
  });
}

export async function findRequestsForUser(
  userId: string,
): Promise<BuybackRequestWithDetails[]> {
  return prisma.buybackRequest.findMany({
    where: { userId },
    include: REQUEST_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * A customer builds up one request item-by-item before shipping
 * anything - this finds the request still open for additions (DRAFT/
 * SUBMITTED/PRE_ESTIMATE) rather than always starting a new one, so
 * repeated "add an item" calls accumulate into a single shipment.
 */
export async function findOpenRequestForUser(
  userId: string,
): Promise<BuybackRequestWithDetails | null> {
  return prisma.buybackRequest.findFirst({
    where: { userId, status: { in: ["DRAFT", "SUBMITTED", "PRE_ESTIMATE"] } },
    include: REQUEST_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function addItemToRequestInTx(
  tx: Tx,
  requestId: string,
  item: NewBuybackItemInput,
) {
  return tx.buybackItem.create({ data: { requestId, ...item } });
}

/** Warehouse receiving queue: shipments the customer confirmed but staff haven't logged in yet. */
export async function listRequestsAwaitingReceipt(): Promise<
  BuybackRequestWithDetails[]
> {
  return prisma.buybackRequest.findMany({
    where: { status: "AWAITING_SHIPMENT" },
    include: REQUEST_DETAIL_INCLUDE,
    orderBy: { submittedAt: "asc" },
  });
}

/** Staff inspection queue: everything physically received but not yet fully inspected. */
export async function listRequestsAwaitingInspection(): Promise<
  BuybackRequestWithDetails[]
> {
  return prisma.buybackRequest.findMany({
    where: { status: { in: ["RECEIVED", "INSPECTION"] } },
    include: REQUEST_DETAIL_INCLUDE,
    orderBy: { submittedAt: "asc" },
  });
}

/** Staff valuation-approval queue (buyback.approve, VALUATION -> CUSTOMER_CONFIRMATION). */
export async function listRequestsAwaitingValuationApproval(): Promise<
  BuybackRequestWithDetails[]
> {
  return prisma.buybackRequest.findMany({
    where: { status: "VALUATION" },
    include: REQUEST_DETAIL_INCLUDE,
    orderBy: { submittedAt: "asc" },
  });
}

/** Staff reconditioning queue: paid requests not yet resellable. */
export async function listRequestsAwaitingReconditioning(): Promise<
  BuybackRequestWithDetails[]
> {
  return prisma.buybackRequest.findMany({
    where: { status: { in: ["PAID", "RECONDITIONING"] } },
    include: REQUEST_DETAIL_INCLUDE,
    orderBy: { submittedAt: "asc" },
  });
}

export async function findItemById(
  id: string,
): Promise<BuybackItemWithDetails | null> {
  return prisma.buybackItem.findUnique({
    where: { id },
    include: ITEM_DETAIL_INCLUDE,
  });
}

export async function findItemByIdInTx(
  tx: Tx,
  id: string,
): Promise<BuybackItemWithDetails> {
  return tx.buybackItem.findUniqueOrThrow({
    where: { id },
    include: ITEM_DETAIL_INCLUDE,
  });
}

export async function updateItemInTx(
  tx: Tx,
  id: string,
  data: Prisma.BuybackItemUpdateInput,
) {
  return tx.buybackItem.update({ where: { id }, data });
}

export interface NewInspectionInput {
  buybackItemId: string;
  inspectorId: string;
  receivedQuantity: number;
  expectedQuantity: number;
  declaredCondition: Condition;
  observedCondition: Condition;
  defects: string[];
  missingParts: string[];
  inspectionPhotos: string[];
  proposedValueMinor: number;
  discrepancyFlag: boolean;
  discrepancyNotes: string | null;
}

export async function createInspectionInTx(tx: Tx, input: NewInspectionInput) {
  return tx.inspection.create({
    data: { ...input, completedAt: new Date() },
  });
}

const BUYBACK_RECEIVING_LOCATION_CODE = "BUYBACK-RECEIVING";

/**
 * Every buyback shipment lands in one dedicated receiving location
 * rather than requiring the warehouse action to pick one - created
 * lazily on first use so a fresh environment doesn't need extra seed
 * data just to accept a return shipment.
 */
export async function findOrCreateBuybackLocationInTx(tx: Tx) {
  const existing = await tx.inventoryLocation.findUnique({
    where: { code: BUYBACK_RECEIVING_LOCATION_CODE },
  });
  if (existing) {
    return existing;
  }
  return tx.inventoryLocation.create({
    data: {
      code: BUYBACK_RECEIVING_LOCATION_CODE,
      name: "Réception rachats",
    },
  });
}

/**
 * Creates the physical unit's ledger row the moment it arrives
 * (condition PENDING_INSPECTION, status INSPECTION) rather than
 * waiting until reconditioning finishes - see the design note in
 * buybackService.receiveShipment for why. originBuybackItemId is set
 * from the start so InventoryMovement history is traceable back to
 * this buyback from its very first row.
 */
export async function createInventoryItemForBuybackInTx(
  tx: Tx,
  input: {
    productVariantId: string;
    serial: string;
    locationId: string;
    originBuybackItemId: string;
  },
) {
  return tx.inventoryItem.create({
    data: {
      productVariantId: input.productVariantId,
      serial: input.serial,
      condition: "PENDING_INSPECTION",
      status: "INSPECTION",
      locationId: input.locationId,
      acquisitionSource: "BUYBACK",
      originBuybackItemId: input.originBuybackItemId,
    },
  });
}

export async function findInventoryItemByBuybackItemInTx(
  tx: Tx,
  buybackItemId: string,
) {
  return tx.inventoryItem.findFirst({
    where: { originBuybackItemId: buybackItemId },
  });
}

/**
 * A rejected buyback item's unit was already given its own
 * InventoryItem row at receiveShipment (status INSPECTION) - it never
 * becomes resalable, so this is the other half of that row's life:
 * INSPECTION -> DISPOSED, ledgered as INSPECTION_REJECTED. A real
 * "return the physical item to the customer" flow is a later phase;
 * DISPOSED is the closest existing InventoryStatus and is documented
 * here as a simplification (ROADMAP.md Phase 6 known gap).
 */
export async function disposeInventoryItemInTx(
  tx: Tx,
  input: { inventoryItemId: string; actorId: string; buybackItemId: string },
) {
  await tx.inventoryItem.update({
    where: { id: input.inventoryItemId },
    data: { status: "DISPOSED" },
  });
  return tx.inventoryMovement.create({
    data: {
      itemId: input.inventoryItemId,
      type: "INSPECTION_REJECTED",
      fromStatus: "INSPECTION",
      toStatus: "DISPOSED",
      actorId: input.actorId,
      referenceType: "BuybackItem",
      referenceId: input.buybackItemId,
      notes: "Article de rachat refusé après inspection.",
    },
  });
}

/**
 * One dedicated single-unit ProductVariant per reconditioned item
 * (rather than InventoryItem carrying its own price) so a used unit's
 * real, condition-specific resale price flows through the existing
 * cart/checkout pricing path (effectivePrice.ts, calculateOrderTotal)
 * completely unchanged - every price-reading call site already trusts
 * ProductVariant.priceMinor. Documented Phase 6 simplification: pooling
 * many used units of the same product under shared variants would need
 * per-unit pricing threaded through Phases 3-5's cart/catalog code,
 * out of scope here (BUYBACK.md §8/§10, ROADMAP.md known gap).
 */
export async function createResaleVariantInTx(
  tx: Tx,
  input: {
    productId: string;
    buybackItemId: string;
    name: string;
    priceMinor: number;
  },
) {
  return tx.productVariant.create({
    data: {
      productId: input.productId,
      sku: `BB-${input.buybackItemId}`,
      name: input.name,
      priceMinor: input.priceMinor,
    },
  });
}

/**
 * The reconditioning pipeline's final step (BUYBACK.md §8): moves the
 * unit onto its new resale variant, sets its final observed condition,
 * and only now flips it AVAILABLE - it is never purchasable straight
 * out of PAID/inspection. Ledgered as INSPECTION_ACCEPTED (fromStatus
 * INSPECTION), the counterpart to disposeInventoryItemInTx's
 * INSPECTION_REJECTED above.
 */
export async function finalizeResaleInventoryItemInTx(
  tx: Tx,
  input: {
    inventoryItemId: string;
    productVariantId: string;
    condition: Condition;
    actorId: string;
    buybackItemId: string;
  },
) {
  await tx.inventoryItem.update({
    where: { id: input.inventoryItemId },
    data: {
      productVariantId: input.productVariantId,
      condition: input.condition,
      status: "AVAILABLE",
    },
  });
  return tx.inventoryMovement.create({
    data: {
      itemId: input.inventoryItemId,
      type: "INSPECTION_ACCEPTED",
      fromStatus: "INSPECTION",
      toStatus: "AVAILABLE",
      actorId: input.actorId,
      referenceType: "BuybackItem",
      referenceId: input.buybackItemId,
      notes: "Reconditionnement terminé - article disponible à la revente.",
    },
  });
}

/**
 * DATABASE.md §4/§6: a buyback-sourced unit must have its own
 * ProductImage rows (inventoryItemId set, productId null) - never
 * inherits the original Product's marketing photos. The CHECK
 * constraint added in the Phase 4 migration is the actual backstop.
 */
export async function createResalePhotosInTx(
  tx: Tx,
  inventoryItemId: string,
  photoUrls: string[],
) {
  await tx.productImage.createMany({
    data: photoUrls.map((url, position) => ({
      inventoryItemId,
      url,
      alt: "Photo de l'article reconditionné",
      position,
    })),
  });
}

/**
 * The first ledger row for a buyback-sourced unit - fromStatus is
 * deliberately null (there was no prior InventoryItem row, mirroring
 * how a purchase-order intake would use PURCHASE_RECEIVED the same
 * way) rather than a synthetic placeholder status.
 */
export async function recordBuybackReceivedMovementInTx(
  tx: Tx,
  input: {
    itemId: string;
    actorId: string;
    buybackItemId: string;
  },
) {
  return tx.inventoryMovement.create({
    data: {
      itemId: input.itemId,
      type: "BUYBACK_RECEIVED",
      fromStatus: null,
      toStatus: "INSPECTION",
      actorId: input.actorId,
      referenceType: "BuybackItem",
      referenceId: input.buybackItemId,
      notes: "Colis de rachat reçu à l'entrepôt.",
    },
  });
}
