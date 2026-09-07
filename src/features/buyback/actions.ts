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
  addBuybackItemSchema,
  confirmShipmentSchema,
} from "@/features/buyback/schemas";
import * as buybackService from "@/server/services/buyback/buybackService";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError("Connectez-vous pour gérer vos rachats.");
  }
  return session.user.id;
}

export async function addBuybackItemAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const input = parseFormDataOrThrow(addBuybackItemSchema, formData);
    await buybackService.addItemToBuybackRequest(userId, input);
    revalidatePath("/rachat");
    return {
      status: "success",
      message: "Article ajouté à votre demande de rachat.",
    };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function confirmShipmentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const input = parseFormDataOrThrow(confirmShipmentSchema, formData);
    await buybackService.confirmShipmentWithNewAddress(
      userId,
      input.requestId,
      {
        fullName: input.fullName,
        line1: input.line1,
        line2: input.line2,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
        phone: input.phone,
      },
    );
    revalidatePath("/rachat");
    revalidatePath(`/rachat/${input.requestId}`);
    return { status: "success", message: "Expédition confirmée." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

/**
 * The accept/reject decision set is dynamic (one per item on the
 * request), so it's read directly from FormData here rather than
 * through a fixed Zod object shape - field names follow the
 * `decision-<itemId>` / `reason-<itemId>` convention the confirmation
 * form renders (see ConfirmAcceptanceForm.tsx).
 */
export async function confirmAcceptanceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const requestId = formData.get("requestId");
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new ValidationFailedError("Demande invalide.");
    }

    const itemIds = formData.getAll("itemIds").map(String);
    const decisions = itemIds.map((itemId) => {
      const accept = formData.get(`decision-${itemId}`) === "accept";
      const rejectionReason = formData.get(`reason-${itemId}`);
      return {
        itemId,
        accept,
        rejectionReason:
          typeof rejectionReason === "string" && rejectionReason.length > 0
            ? rejectionReason
            : undefined,
      };
    });

    await buybackService.confirmCustomerAcceptance(
      userId,
      requestId,
      decisions,
    );
    revalidatePath(`/rachat/${requestId}`);
    return { status: "success", message: "Votre décision a été enregistrée." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}
