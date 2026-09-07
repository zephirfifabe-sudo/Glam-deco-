import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Role } from "@/lib/db/client";
import type { Actor } from "@/lib/permissions/permissionService";
import * as buybackService from "@/server/services/buyback/buybackService";
import * as inspectionService from "@/server/services/buyback/inspectionService";
import * as payoutService from "@/server/services/buyback/payoutService";
import * as reconditioningService from "@/server/services/buyback/reconditioningService";
import * as inventoryService from "@/server/services/inventory/inventoryService";

// End-to-end coverage of BUYBACK.md's whole state machine (ADR-005):
// submit -> pre-estimate -> ship -> receive -> inspect -> approve
// valuation -> customer confirms (partial accept) -> payout
// (maker-checker enforced) -> reconditioning -> a real purchasable
// InventoryItem. Also covers the two eligibility gates (BUYBACK.md §3)
// that must fail closed: no BuybackRule for the category, and a
// personalized product without an explicit exception.

const runId = `buyback-${Date.now()}`;

const PERMISSIONS_NEEDED = [
  { key: "buyback.inspect", role: "INSPECTOR" as const },
  { key: "buyback.approve", role: "MANAGER" as const },
  { key: "payout.approve", role: "FINANCE" as const },
  { key: "inventory.write", role: "WAREHOUSE" as const },
];

let categoryId: string;
let personalizedCategoryId: string; // category with no BuybackRule at all
let productId: string;
let variantId: string;
let personalizedProductId: string;
let personalizedVariantId: string;
let locationId: string;

let customerId: string;
let addressId: string;
let inspectorActor: Actor;
let managerActor: Actor;
let warehouseActor: Actor;
let financeActor: Actor;

const CONDITION_MULTIPLIERS = {
  NEW: 0.9,
  LIKE_NEW: 0.8,
  EXCELLENT: 0.7,
  GOOD: 0.6,
  FAIR: 0.45,
  DAMAGED: 0.25,
  INCOMPLETE: 0.15,
  UNUSABLE: 0.05,
};

beforeAll(async () => {
  for (const p of PERMISSIONS_NEEDED) {
    const permission = await prisma.permission.upsert({
      where: { key: p.key },
      update: {},
      create: { key: p.key, description: p.key },
    });
    await prisma.rolePermission.upsert({
      where: {
        role_permissionId: { role: p.role, permissionId: permission.id },
      },
      update: {},
      create: { role: p.role, permissionId: permission.id },
    });
  }

  const category = await prisma.category.create({
    data: { slug: `${runId}-cat`, name: "Buyback test category" },
  });
  categoryId = category.id;
  await prisma.buybackRule.create({
    data: {
      categoryId,
      active: true,
      conditionMultipliers: CONDITION_MULTIPLIERS,
      shippingCostMinor: 300,
      inspectionCostMinor: 100,
      cleaningCostMinor: 100,
      storageCostMinor: 100,
      minPayoutMinor: 0,
      maxQuantityPerRequest: 5,
    },
  });

  const personalizedCategory = await prisma.category.create({
    data: { slug: `${runId}-no-rule-cat`, name: "No buyback rule category" },
  });
  personalizedCategoryId = personalizedCategory.id;

  const product = await prisma.product.create({
    data: {
      slug: `${runId}-product`,
      title: "Buyback test product",
      description: "Used only by the buyback lifecycle test.",
      basePriceMinor: 20000,
      condition: "NEW",
      status: "ACTIVE",
      categoryId,
    },
  });
  productId = product.id;
  const variant = await prisma.productVariant.create({
    data: { productId, sku: `${runId}-sku`, name: "Default" },
  });
  variantId = variant.id;

  const personalizedProduct = await prisma.product.create({
    data: {
      slug: `${runId}-personalized-product`,
      title: "Personalized product",
      description: "Personalized, not eligible for buyback.",
      basePriceMinor: 5000,
      condition: "NEW",
      status: "ACTIVE",
      categoryId,
      personalizationRequired: true,
      personalizationBuybackEligible: false,
    },
  });
  personalizedProductId = personalizedProduct.id;
  const personalizedVariant = await prisma.productVariant.create({
    data: {
      productId: personalizedProductId,
      sku: `${runId}-personalized-sku`,
      name: "Default",
    },
  });
  personalizedVariantId = personalizedVariant.id;

  const location = await prisma.inventoryLocation.create({
    data: { code: `${runId}-loc`, name: "Buyback test location" },
  });
  locationId = location.id;

  const customer = await prisma.user.create({
    data: {
      email: `${runId}-customer@example.com`,
      passwordHash: "not-a-real-hash",
      name: "Buyback Test Customer",
    },
  });
  customerId = customer.id;

  const address = await prisma.address.create({
    data: {
      userId: customerId,
      type: "SHIPPING",
      fullName: "Buyback Test Customer",
      line1: "1 Rue du Test",
      postalCode: "1000",
      city: "Bruxelles",
      country: "BE",
    },
  });
  addressId = address.id;

  async function makeStaff(email: string, roles: Role[]): Promise<Actor> {
    const user = await prisma.user.create({
      data: { email, passwordHash: "not-a-real-hash", name: email },
    });
    for (const role of roles) {
      await prisma.userRoleAssignment.create({
        data: { userId: user.id, role },
      });
    }
    return { id: user.id, roles };
  }

  inspectorActor = await makeStaff(`${runId}-inspector@example.com`, [
    "INSPECTOR",
  ]);
  // Manager also holds FINANCE so the maker-checker test below can
  // prove the *same person* is rejected, not merely someone lacking
  // payout.approve.
  managerActor = await makeStaff(`${runId}-manager@example.com`, [
    "MANAGER",
    "FINANCE",
  ]);
  warehouseActor = await makeStaff(`${runId}-warehouse@example.com`, [
    "WAREHOUSE",
  ]);
  financeActor = await makeStaff(`${runId}-finance@example.com`, ["FINANCE"]);
});

afterAll(async () => {
  await prisma.productImage.deleteMany({
    where: {
      inventoryItem: { originBuybackItem: { request: { userId: customerId } } },
    },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { item: { originBuybackItem: { request: { userId: customerId } } } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { originBuybackItem: { request: { userId: customerId } } },
  });
  await prisma.payoutEvent.deleteMany({
    where: { payout: { buybackRequest: { userId: customerId } } },
  });
  await prisma.payout.deleteMany({
    where: { buybackRequest: { userId: customerId } },
  });
  await prisma.inspection.deleteMany({
    where: { buybackItem: { request: { userId: customerId } } },
  });
  const resaleVariants = await prisma.productVariant.findMany({
    where: { sku: { startsWith: "BB-" }, product: { categoryId } },
    select: { id: true },
  });
  await prisma.productVariant.deleteMany({
    where: { id: { in: resaleVariants.map((v) => v.id) } },
  });
  await prisma.buybackItem.deleteMany({
    where: { request: { userId: customerId } },
  });
  await prisma.buybackRequest.deleteMany({ where: { userId: customerId } });
  await prisma.address.deleteMany({ where: { userId: customerId } });
  await prisma.userRoleAssignment.deleteMany({
    where: {
      userId: {
        in: [
          inspectorActor.id,
          managerActor.id,
          warehouseActor.id,
          financeActor.id,
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          customerId,
          inspectorActor.id,
          managerActor.id,
          warehouseActor.id,
          financeActor.id,
        ],
      },
    },
  });
  await prisma.productVariant.deleteMany({
    where: { id: { in: [variantId, personalizedVariantId] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [productId, personalizedProductId] } },
  });
  await prisma.buybackRule.deleteMany({ where: { categoryId } });
  await prisma.category.deleteMany({
    where: { id: { in: [categoryId, personalizedCategoryId] } },
  });
  await prisma.inventoryLocation.delete({ where: { id: locationId } });
  await prisma.$disconnect();
});

describe("Eligibility (BUYBACK.md §3, fail closed)", () => {
  it("rejects a personalized product without an explicit exception", async () => {
    await expect(
      buybackService.addItemToBuybackRequest(customerId, {
        productVariantId: personalizedVariantId,
        declaredCondition: "GOOD",
      }),
    ).rejects.toThrow();
  });

  it("rejects a category with no active BuybackRule", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `${runId}-no-rule-product`,
        title: "No rule product",
        description: "Category has no BuybackRule row.",
        basePriceMinor: 3000,
        condition: "NEW",
        status: "ACTIVE",
        categoryId: personalizedCategoryId,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${runId}-no-rule-sku`,
        name: "Default",
      },
    });

    await expect(
      buybackService.addItemToBuybackRequest(customerId, {
        productVariantId: variant.id,
        declaredCondition: "GOOD",
      }),
    ).rejects.toThrow();

    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
});

describe("Full buyback lifecycle (ADR-005)", () => {
  let requestId: string;
  let itemGoodId: string;
  let itemFairId: string;
  let payoutId: string;

  it("accumulates two items into one open request via repeated submission", async () => {
    const first = await buybackService.addItemToBuybackRequest(customerId, {
      productVariantId: variantId,
      declaredCondition: "GOOD",
      declaredNotes: "Utilisé une fois.",
    });
    expect(first.status).toBe("PRE_ESTIMATE");
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.preEstimateMinMinor).toBeLessThanOrEqual(
      first.items[0]?.preEstimateMaxMinor ?? 0,
    );
    requestId = first.id;
    itemGoodId = first.items[0]!.id;

    const second = await buybackService.addItemToBuybackRequest(customerId, {
      productVariantId: variantId,
      declaredCondition: "FAIR",
    });
    expect(second.id).toBe(requestId);
    expect(second.items).toHaveLength(2);
    itemFairId = second.items.find((item) => item.id !== itemGoodId)!.id;
  });

  it("confirms shipment: PRE_ESTIMATE -> AWAITING_SHIPMENT", async () => {
    await buybackService.confirmShipment(customerId, requestId, addressId);
    const request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("AWAITING_SHIPMENT");
  });

  it("receives the shipment: creates one InventoryItem per item, INSPECTION status", async () => {
    await buybackService.receiveShipment(warehouseActor, requestId);
    const request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("INSPECTION");

    const items = await prisma.inventoryItem.findMany({
      where: { originBuybackItemId: { in: [itemGoodId, itemFairId] } },
    });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.status).toBe("INSPECTION");
      expect(item.condition).toBe("PENDING_INSPECTION");
      expect(item.acquisitionSource).toBe("BUYBACK");
    }

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        itemId: { in: items.map((i) => i.id) },
        type: "BUYBACK_RECEIVED",
      },
    });
    expect(movements).toHaveLength(2);
  });

  it("inspects both items, flags the discrepancy, and advances to VALUATION once both are done", async () => {
    await inspectionService.recordInspection(inspectorActor, {
      buybackItemId: itemGoodId,
      receivedQuantity: 1,
      expectedQuantity: 1,
      observedCondition: "GOOD", // matches declared - no discrepancy
    });

    let request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("INSPECTION"); // second item still pending

    await inspectionService.recordInspection(inspectorActor, {
      buybackItemId: itemFairId,
      receivedQuantity: 1,
      expectedQuantity: 1,
      observedCondition: "DAMAGED", // declared FAIR - discrepancy
    });

    request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("VALUATION");

    const goodItem = request.items.find((i) => i.id === itemGoodId)!;
    const fairItem = request.items.find((i) => i.id === itemFairId)!;
    expect(goodItem.inspection?.discrepancyFlag).toBe(false);
    expect(fairItem.inspection?.discrepancyFlag).toBe(true);
    expect(fairItem.finalValueMinor).toBeLessThan(
      goodItem.finalValueMinor ?? 0,
    );
  });

  it("requires buyback.approve to move VALUATION -> CUSTOMER_CONFIRMATION", async () => {
    await inspectionService.approveValuation(managerActor, requestId);
    const request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("CUSTOMER_CONFIRMATION");
  });

  it("customer partially accepts: derives PARTIALLY_ACCEPTED, disposes the rejected unit, creates a Payout", async () => {
    const request = await buybackService.confirmCustomerAcceptance(
      customerId,
      requestId,
      [
        { itemId: itemGoodId, accept: true },
        {
          itemId: itemFairId,
          accept: false,
          rejectionReason: "Trop endommagé.",
        },
      ],
    );
    expect(request.status).toBe("PAYOUT_PENDING");
    expect(request.payout).not.toBeNull();
    expect(request.payout?.status).toBe("PENDING");

    const goodItem = request.items.find((i) => i.id === itemGoodId)!;
    expect(request.payout?.amountMinor).toBe(goodItem.finalValueMinor);

    const fairInventoryItem = await prisma.inventoryItem.findFirstOrThrow({
      where: { originBuybackItemId: itemFairId },
    });
    expect(fairInventoryItem.status).toBe("DISPOSED");

    payoutId = request.payout!.id;
  });

  it("enforces maker-checker: the valuation approver cannot release their own payout", async () => {
    await expect(
      payoutService.releasePayout(managerActor, payoutId),
    ).rejects.toThrow();

    const payout = await prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
    });
    expect(payout.status).toBe("PENDING");
  });

  it("releases the payout with a different actor: PENDING -> PAID, request -> PAID", async () => {
    await payoutService.releasePayout(financeActor, payoutId);
    const payout = await prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
    });
    expect(payout.status).toBe("PAID");
    expect(payout.releasedById).toBe(financeActor.id);

    const request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("PAID");
  });

  it("reconditions the accepted item into a real, purchasable InventoryItem", async () => {
    await reconditioningService.completeReconditioning(
      warehouseActor,
      requestId,
      [
        {
          buybackItemId: itemGoodId,
          finalCondition: "GOOD",
          photos: ["https://example.com/photo-1.jpg"],
          resalePriceMinor: 9000,
        },
      ],
    );

    const request = await buybackService.getBuybackRequestForOwner(
      customerId,
      requestId,
    );
    expect(request.status).toBe("AVAILABLE_FOR_RESALE");

    const inventoryItem = await prisma.inventoryItem.findFirstOrThrow({
      where: { originBuybackItemId: itemGoodId },
      include: { images: true },
    });
    expect(inventoryItem.status).toBe("AVAILABLE");
    expect(inventoryItem.condition).toBe("GOOD");
    expect(inventoryItem.images).toHaveLength(1);
    expect(inventoryItem.images[0]?.productId).toBeNull();

    const resaleVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: inventoryItem.productVariantId },
    });
    expect(resaleVariant.priceMinor).toBe(9000);
    expect(resaleVariant.id).not.toBe(variantId);

    // Never made purchasable straight out of PAID/inspection (BUYBACK.md
    // §8) - it only becomes AVAILABLE, and thus reservable, at the very
    // end of this pipeline.
    const availableCount = await inventoryService.getAvailableCount(
      resaleVariant.id,
    );
    expect(availableCount).toBe(1);
  });
});
