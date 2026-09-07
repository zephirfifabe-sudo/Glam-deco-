import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  getAvailableCount,
  releaseUnit,
  reserveOneUnit,
} from "@/server/services/inventory/inventoryService";
import {
  InsufficientInventoryError,
  InvalidStateTransitionError,
} from "@/lib/errors";

// This is the mandatory test from DATABASE.md §5 / brief §26 / §68
// (Test 5): the last-unit race condition. It runs against a real
// PostgreSQL instance (no mocking of $transaction/$queryRaw would
// exercise real row locking) - requires DATABASE_URL to point at a
// reachable Postgres, exactly like CI's service container.

const runId = `concurrency-${Date.now()}`;

let categoryId: string;
let productId: string;
let lastUnitVariantId: string;
let smallPoolVariantId: string;
let releaseFlowVariantId: string;
let locationId: string;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${runId}-cat`, name: "Test category" },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      slug: `${runId}-product`,
      title: "Concurrency test product",
      description: "Used only by the inventory concurrency test.",
      basePriceMinor: 1000,
      condition: "NEW",
      status: "ACTIVE",
      categoryId,
    },
  });
  productId = product.id;

  const lastUnitVariant = await prisma.productVariant.create({
    data: { productId, sku: `${runId}-last-unit`, name: "Last unit" },
  });
  lastUnitVariantId = lastUnitVariant.id;

  const smallPoolVariant = await prisma.productVariant.create({
    data: { productId, sku: `${runId}-small-pool`, name: "Small pool" },
  });
  smallPoolVariantId = smallPoolVariant.id;

  const releaseFlowVariant = await prisma.productVariant.create({
    data: { productId, sku: `${runId}-release-flow`, name: "Release flow" },
  });
  releaseFlowVariantId = releaseFlowVariant.id;

  const location = await prisma.inventoryLocation.create({
    data: { code: `${runId}-loc`, name: "Test location" },
  });
  locationId = location.id;

  // Exactly one AVAILABLE unit - the scenario DATABASE.md §5 describes.
  await prisma.inventoryItem.create({
    data: {
      serial: `${runId}-last-unit-0001`,
      productVariantId: lastUnitVariantId,
      condition: "NEW",
      status: "AVAILABLE",
      locationId,
    },
  });

  // Two AVAILABLE units, for the "N in stock, N+1 buyers" variant below.
  for (let i = 1; i <= 2; i += 1) {
    await prisma.inventoryItem.create({
      data: {
        serial: `${runId}-small-pool-000${i}`,
        productVariantId: smallPoolVariantId,
        condition: "NEW",
        status: "AVAILABLE",
        locationId,
      },
    });
  }

  // Two AVAILABLE units dedicated to the release-flow tests below - kept
  // separate from lastUnitVariantId/smallPoolVariantId, which the
  // concurrency tests above deliberately exhaust.
  for (let i = 1; i <= 2; i += 1) {
    await prisma.inventoryItem.create({
      data: {
        serial: `${runId}-release-flow-000${i}`,
        productVariantId: releaseFlowVariantId,
        condition: "NEW",
        status: "AVAILABLE",
        locationId,
      },
    });
  }
});

afterAll(async () => {
  const variantIds = [
    lastUnitVariantId,
    smallPoolVariantId,
    releaseFlowVariantId,
  ];
  await prisma.inventoryMovement.deleteMany({
    where: { item: { productVariantId: { in: variantIds } } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { productVariantId: { in: variantIds } },
  });
  await prisma.productVariant.deleteMany({
    where: { id: { in: variantIds } },
  });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.inventoryLocation.delete({ where: { id: locationId } });
  await prisma.$disconnect();
});

describe("inventory concurrency (DATABASE.md §5, brief §26/§68 Test 5)", () => {
  it("allows exactly one of two concurrent buyers to claim the last unit", async () => {
    const results = await Promise.allSettled([
      reserveOneUnit(lastUnitVariantId, {
        referenceType: "test",
        referenceId: "buyer-a",
      }),
      reserveOneUnit(lastUnitVariantId, {
        referenceType: "test",
        referenceId: "buyer-b",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InsufficientInventoryError,
    );

    // No double-allocation left behind: zero units still available,
    // and the ledger has exactly one RESERVED movement, not two.
    expect(await getAvailableCount(lastUnitVariantId)).toBe(0);

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        item: { productVariantId: lastUnitVariantId },
        type: "RESERVED",
      },
    });
    expect(movements).toHaveLength(1);

    const items = await prisma.inventoryItem.findMany({
      where: { productVariantId: lastUnitVariantId },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("RESERVED");
  });

  it("allows exactly N buyers to succeed against a pool of N units, no more", async () => {
    const results = await Promise.allSettled([
      reserveOneUnit(smallPoolVariantId, {
        referenceType: "test",
        referenceId: "buyer-1",
      }),
      reserveOneUnit(smallPoolVariantId, {
        referenceType: "test",
        referenceId: "buyer-2",
      }),
      reserveOneUnit(smallPoolVariantId, {
        referenceType: "test",
        referenceId: "buyer-3",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);

    // Each successful reservation must have claimed a *distinct* item -
    // this is what SKIP LOCKED buys over a plain FOR UPDATE: two
    // genuinely different rows, not the same row twice.
    const claimedIds = fulfilled.map(
      (r) => (r as PromiseFulfilledResult<string>).value,
    );
    expect(new Set(claimedIds).size).toBe(2);

    expect(await getAvailableCount(smallPoolVariantId)).toBe(0);
  });
});

describe("releaseUnit (DATABASE.md §11 ledger, brief §107 illegal transitions)", () => {
  it("puts a RESERVED unit back to AVAILABLE and records a RELEASED movement", async () => {
    const itemId = await reserveOneUnit(releaseFlowVariantId, {
      referenceType: "test",
      referenceId: "release-flow",
    });

    await releaseUnit(itemId, {
      referenceType: "test",
      referenceId: "release-flow",
    });

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.status).toBe("AVAILABLE");

    const released = await prisma.inventoryMovement.findMany({
      where: { itemId, type: "RELEASED" },
    });
    expect(released).toHaveLength(1);
  });

  it("refuses to release a unit that is not RESERVED", async () => {
    const available = await prisma.inventoryItem.findFirstOrThrow({
      where: { productVariantId: releaseFlowVariantId, status: "AVAILABLE" },
    });

    await expect(releaseUnit(available.id)).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    );
  });
});
