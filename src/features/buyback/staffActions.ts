"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import {
  UnauthenticatedError,
  ValidationFailedError,
  toClientMessage,
} from "@/lib/errors";
import { parseFormDataOrThrow } from "@/lib/validation/parse";
import {
  approveValuationSchema,
  cancelPayoutSchema,
  receiveShipmentSchema,
  recordInspectionSchema,
  releasePayoutSchema,
} from "@/features/buyback/staffSchemas";
import * as buybackService from "@/server/services/buyback/buybackService";
import * as inspectionService from "@/server/services/buyback/inspectionService";
import * as payoutService from "@/server/services/buyback/payoutService";
import * as reconditioningService from "@/server/services/buyback/reconditioningService";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

async function requireActor() {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError("Connectez-vous pour accéder à cet espace.");
  }
  return { id: session.user.id, roles: session.user.roles };
}

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function receiveShipmentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const input = parseFormDataOrThrow(receiveShipmentSchema, formData);
    await buybackService.receiveShipment(actor, input.requestId);
    revalidatePath("/personnel/rachat/reception");
    revalidatePath("/personnel/rachat/inspection");
    return { status: "success", message: "Colis marqué comme reçu." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function recordInspectionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const input = parseFormDataOrThrow(recordInspectionSchema, formData);
    await inspectionService.recordInspection(actor, {
      buybackItemId: input.buybackItemId,
      receivedQuantity: input.receivedQuantity,
      expectedQuantity: input.expectedQuantity,
      observedCondition: input.observedCondition,
      defects: splitLines(input.defects),
      missingParts: splitLines(input.missingParts),
      inspectionPhotos: splitLines(input.inspectionPhotos),
      overrideValueMinor: input.overrideValueMinor,
      overrideJustification: input.overrideJustification,
    });
    revalidatePath("/personnel/rachat/inspection");
    revalidatePath("/personnel/rachat/validation");
    return { status: "success", message: "Inspection enregistrée." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function approveValuationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const input = parseFormDataOrThrow(approveValuationSchema, formData);
    await inspectionService.approveValuation(actor, input.requestId);
    revalidatePath("/personnel/rachat/validation");
    return { status: "success", message: "Estimation validée." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function releasePayoutAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const input = parseFormDataOrThrow(releasePayoutSchema, formData);
    await payoutService.releasePayout(actor, input.payoutId);
    revalidatePath("/personnel/rachat/paiements");
    return { status: "success", message: "Paiement libéré." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function cancelPayoutAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const input = parseFormDataOrThrow(cancelPayoutSchema, formData);
    await payoutService.cancelPayout(actor, input.payoutId, input.reason);
    revalidatePath("/personnel/rachat/paiements");
    return { status: "success", message: "Paiement annulé." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

/**
 * The reconditioning form covers every ACCEPTED item on one request in
 * a single submission (reconditioningService.completeReconditioning is
 * one atomic call for all of them) - field names follow the
 * `condition-<itemId>` / `photos-<itemId>` / `price-<itemId>`
 * convention the form renders (see ReconditioningForm.tsx).
 */
export async function completeReconditioningAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const requestId = formData.get("requestId");
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new ValidationFailedError("Demande invalide.");
    }
    const itemIds = formData.getAll("itemIds").map(String);

    const items = itemIds.map((itemId) => {
      const finalCondition = String(
        formData.get(`condition-${itemId}`) ?? "GOOD",
      );
      const photos = splitLines(String(formData.get(`photos-${itemId}`) ?? ""));
      const resalePriceMinor = Number(formData.get(`price-${itemId}`) ?? 0);
      return {
        buybackItemId: itemId,
        finalCondition: finalCondition as never,
        photos,
        resalePriceMinor,
      };
    });

    await reconditioningService.completeReconditioning(actor, requestId, items);
    revalidatePath("/personnel/rachat/reconditionnement");
    return {
      status: "success",
      message: "Reconditionnement terminé - article remis en vente.",
    };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}
