"use client";

import { useActionState } from "react";
import {
  releasePayoutAction,
  type ActionState,
} from "@/features/buyback/staffActions";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function ReleasePayoutForm({ payoutId }: { payoutId: string }) {
  const [state, formAction, pending] = useActionState(
    releasePayoutAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="payoutId" value={payoutId} />
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "..." : "Libérer le paiement"}
      </Button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-600">
          {state.message}
        </span>
      )}
    </form>
  );
}
