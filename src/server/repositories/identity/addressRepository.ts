import { prisma } from "@/lib/db/client";
import type { AddressType } from "@prisma/client";

// Only server/repositories/** may import @prisma/client (ARCHITECTURE.md §2).

export interface NewAddressInput {
  userId: string;
  type: AddressType;
  fullName: string;
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  country: string;
  phone?: string | null;
}

export async function createAddress(input: NewAddressInput) {
  return prisma.address.create({ data: input });
}
