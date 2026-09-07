import { z } from "zod";

const conditionEnum = z.enum([
  "NEW",
  "LIKE_NEW",
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "DAMAGED",
  "INCOMPLETE",
  "UNUSABLE",
]);

export const addBuybackItemSchema = z.object({
  productVariantId: z.string().min(1),
  originalOrderItemId: z.string().optional(),
  declaredCondition: conditionEnum,
  declaredNotes: z.string().max(1000).optional(),
});

export const confirmShipmentSchema = z.object({
  requestId: z.string().min(1),
  fullName: z.string().min(1).max(200),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  postalCode: z.string().min(1).max(20),
  city: z.string().min(1).max(120),
  country: z.string().length(2),
  phone: z.string().max(30).optional(),
});
