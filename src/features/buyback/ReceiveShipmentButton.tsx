"use client";

import { useActionState } from "react";
import {
  receiveShipmentAction,
  type ActionState,
} from "@/features/buyback/staffActions";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function ReceiveShipmentButton({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    receiveShipmentAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "..." : "Marquer reçu"}
      </Button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-600">
          {state.message}
        </span>
      )}
    </form>
  );
}
