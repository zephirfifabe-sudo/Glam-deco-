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

export const receiveShipmentSchema = z.object({
  requestId: z.string().min(1),
});

export const recordInspectionSchema = z.object({
  buybackItemId: z.string().min(1),
  receivedQuantity: z.coerce.number().int().min(0),
  expectedQuantity: z.coerce.number().int().min(1),
  observedCondition: conditionEnum,
  defects: z.string().optional(),
  missingParts: z.string().optional(),
  inspectionPhotos: z.string().optional(),
  // An empty FormData field still submits as "" (present, not absent),
  // and z.coerce.number() would turn that into 0 - a defined value
  // that would wrongly trigger the "override requires a justification"
  // check in inspectionService for every inspection, not just ones
  // that actually set an override. Blank out "" before coercion so the
  // field is genuinely undefined when the staff member left it empty.
  overrideValueMinor: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(0).optional(),
  ),
  overrideJustification: z.string().max(1000).optional(),
});

export const approveValuationSchema = z.object({
  requestId: z.string().min(1),
});

export const releasePayoutSchema = z.object({
  payoutId: z.string().min(1),
});

export const cancelPayoutSchema = z.object({
  payoutId: z.string().min(1),
  reason: z.string().min(1).max(500),
});
