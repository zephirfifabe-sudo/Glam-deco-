"use client";

import { useActionState } from "react";
import {
  createCheckoutSessionAction,
  type CheckoutState,
} from "@/features/checkout/actions";
import { Button } from "@/components/ui/Button";

const initialState: CheckoutState = { status: "idle" };

export function CheckoutButton() {
  const [state, formAction, pending] = useActionState(
    createCheckoutSessionAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Redirection vers le paiement..." : "Passer commande"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
