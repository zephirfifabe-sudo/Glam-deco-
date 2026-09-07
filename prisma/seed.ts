/**
 * Realistic local development seed data (brief §113): permission
 * catalog + default role matrix (SECURITY.md §2), a category/event-type
 * taxonomy, a handful of NEW and USED products, and one documented test
 * account per role. Passwords below are dev-only placeholders, never
 * real secrets, and only ever apply to this local seed - see README.md.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const PERMISSIONS = [
  { key: "product.read", description: "View product catalog data" },
  { key: "product.write", description: "Create/edit products and variants" },
  { key: "inventory.read", description: "View inventory items and movements" },
  {
    key: "inventory.write",
    description: "Adjust inventory items and movements",
  },
  { key: "order.read", description: "View any customer's orders" },
  { key: "order.manage", description: "Change order state, issue refunds" },
  { key: "buyback.read", description: "View any customer's buyback requests" },
  { key: "buyback.inspect", description: "Record inspection results" },
  { key: "buyback.approve", description: "Approve final buyback valuation" },
  { key: "payout.create", description: "Prepare a buyback payout" },
  {
    key: "payout.approve",
    description: "Release a prepared payout (maker-checker)",
  },
  { key: "refund.create", description: "Issue an order refund" },
  { key: "user.read", description: "View user accounts" },
  { key: "user.manage", description: "Edit user accounts and roles" },
  { key: "fraud.read", description: "View fraud signals" },
  { key: "fraud.review", description: "Resolve/dismiss fraud signals" },
  { key: "audit.read", description: "View the audit log" },
  { key: "admin.access", description: "Access the admin back-office" },
] as const;

// SECURITY.md §2 default matrix. ADMIN and SUPER_ADMIN are identical for
// now because the permissions that should distinguish them (role
// management, kill switches) don't exist yet - they land in Phase 7/11.
const ROLE_MATRIX: Record<string, readonly string[]> = {
  CUSTOMER: [],
  SUPPORT: ["order.read", "buyback.read", "user.read"],
  INSPECTOR: ["buyback.read", "buyback.inspect"],
  WAREHOUSE: ["inventory.read", "inventory.write"],
  FINANCE: ["payout.create", "payout.approve", "refund.create"],
  MANAGER: ["product.write", "order.manage", "buyback.approve", "fraud.review"],
  ADMIN: PERMISSIONS.map((p) => p.key),
  SUPER_ADMIN: PERMISSIONS.map((p) => p.key),
};

const DEV_PASSWORD = "dev-local-password-only";

const TEST_USERS = [
  { email: "customer@glamdeco.test", name: "Camille Client", role: "CUSTOMER" },
  { email: "support@glamdeco.test", name: "Sacha Support", role: "SUPPORT" },
  {
    email: "inspector@glamdeco.test",
    name: "Ines Inspecteur",
    role: "INSPECTOR",
  },
  {
    email: "warehouse@glamdeco.test",
    name: "Walid Entrepot",
    role: "WAREHOUSE",
  },
  { email: "finance@glamdeco.test", name: "Fanny Finance", role: "FINANCE" },
  { email: "manager@glamdeco.test", name: "Marc Manager", role: "MANAGER" },
  { email: "admin@glamdeco.test", name: "Alex Admin", role: "ADMIN" },
] as const;

async function seedPermissions() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const [role, keys] of Object.entries(ROLE_MATRIX)) {
    for (const key of keys) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key },
      });
      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: {
            role: role as never,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { role: role as never, permissionId: permission.id },
      });
    }
  }
}

async function seedTestUsers() {
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
  });

  for (const testUser of TEST_USERS) {
    const user = await prisma.user.upsert({
      where: { email: testUser.email },
      update: {},
      create: {
        email: testUser.email,
        name: testUser.name,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: testUser.role as never } },
      update: {},
      create: { userId: user.id, role: testUser.role as never },
    });
  }
}

async function seedCatalog() {
  const mariage = await prisma.category.upsert({
    where: { slug: "decoration-mariage" },
    update: {},
    create: { slug: "decoration-mariage", name: "Décoration mariage" },
  });
  const babyShower = await prisma.category.upsert({
    where: { slug: "decoration-baby-shower" },
    update: {},
    create: { slug: "decoration-baby-shower", name: "Décoration baby shower" },
  });

  await prisma.eventType.upsert({
    where: { slug: "mariage" },
    update: {},
    create: { slug: "mariage", name: "Mariage" },
  });
  await prisma.eventType.upsert({
    where: { slug: "baby-shower" },
    update: {},
    create: { slug: "baby-shower", name: "Baby Shower" },
  });

  const arche = await prisma.product.upsert({
    where: { slug: "arche-florale-blanche-2m" },
    update: {},
    create: {
      slug: "arche-florale-blanche-2m",
      title: "Arche florale blanche 2m",
      description:
        "Arche décorative florale blanche, idéale pour cérémonie de mariage en extérieur ou intérieur.",
      basePriceMinor: 15000,
      condition: "NEW",
      status: "ACTIVE",
      categoryId: mariage.id,
      variants: {
        create: [{ sku: "ARCHE-BLANC-2M", name: "Blanc / 2m" }],
      },
      images: {
        create: [
          {
            url: "https://placehold.co/800x600?text=Arche+florale",
            alt: "Arche florale blanche",
            position: 0,
          },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "arche-florale-blanche-2m-occasion" },
    update: {},
    create: {
      slug: "arche-florale-blanche-2m-occasion",
      title: "Arche florale blanche 2m (occasion, très bon état)",
      description:
        "Même arche, reconditionnée après un premier événement et inspectée par notre équipe.",
      basePriceMinor: 9000,
      condition: "USED",
      status: "ACTIVE",
      categoryId: mariage.id,
      variants: {
        create: [
          { sku: "ARCHE-BLANC-2M-OCC-001", name: "Blanc / 2m - occasion" },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "guirlande-ballons-pastel" },
    update: {},
    create: {
      slug: "guirlande-ballons-pastel",
      title: "Guirlande de ballons pastel",
      description: "Guirlande de ballons tons pastel pour baby shower.",
      basePriceMinor: 4500,
      condition: "NEW",
      status: "ACTIVE",
      categoryId: babyShower.id,
      variants: { create: [{ sku: "GUIRLANDE-PASTEL", name: "Pastel" }] },
    },
  });

  return { arche };
}

async function main() {
  await seedPermissions();
  await seedTestUsers();
  await seedCatalog();

  console.log("Seed complete.");
  console.log(`Test accounts (password: "${DEV_PASSWORD}"):`);
  for (const u of TEST_USERS) {
    console.log(`  ${u.role.padEnd(11)} ${u.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
