import { z } from "zod";

export const addToCartSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(10),
});

export const removeFromCartSchema = z.object({
  productVariantId: z.string().min(1),
});
