"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthenticatedError, toClientMessage } from "@/lib/errors";
import { logEvent } from "@/lib/logging/logger";
import * as checkoutService from "@/server/services/checkout/checkoutService";

export interface CheckoutState {
  status: "idle" | "error";
  message?: string;
}

export async function createCheckoutSessionAction(
  _prevState: CheckoutState,
  _formData: FormData,
): Promise<CheckoutState> {
  // redirect() throws a special Next.js control-flow error - called
  // after the try/catch below, never inside it (see the same note in
  // features/catalog/actions.ts).
  let checkoutUrl: string;
  try {
    const session = await auth();
    if (!session?.user) {
      throw new UnauthenticatedError("Connectez-vous pour commander.");
    }
    const result = await checkoutService.createCheckoutSession(session.user.id);
    logEvent("checkout.session_created", {
      actorId: session.user.id,
      resourceType: "Order",
      resourceId: result.orderId,
      result: "success",
    });
    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
  redirect(checkoutUrl);
}
