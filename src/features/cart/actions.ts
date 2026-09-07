"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { UnauthenticatedError, toClientMessage } from "@/lib/errors";
import { parseFormDataOrThrow } from "@/lib/validation/parse";
import { addToCartSchema, removeFromCartSchema } from "@/features/cart/schemas";
import * as cartService from "@/server/services/cart/cartService";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError("Connectez-vous pour gérer votre panier.");
  }
  return session.user.id;
}

export async function addToCartAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const input = parseFormDataOrThrow(addToCartSchema, formData);
    await cartService.addItem(userId, input.productVariantId, input.quantity);
    revalidatePath("/panier");
    return { status: "success", message: "Ajouté au panier." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function removeFromCartAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const input = parseFormDataOrThrow(removeFromCartSchema, formData);
    await cartService.removeItem(userId, input.productVariantId);
    revalidatePath("/panier");
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}
