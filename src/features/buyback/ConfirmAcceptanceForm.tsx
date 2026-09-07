"use client";

import { useActionState } from "react";
import {
  confirmAcceptanceAction,
  type ActionState,
} from "@/features/buyback/actions";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";

const initialState: ActionState = { status: "idle" };

export interface ConfirmableItem {
  id: string;
  productTitle: string;
  variantName: string;
  finalValueMinor: number;
}

export function ConfirmAcceptanceForm({
  requestId,
  items,
}: {
  requestId: string;
  items: ConfirmableItem[];
}) {
  const [state, formAction, pending] = useActionState(
    confirmAcceptanceAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="requestId" value={requestId} />

      {items.map((item) => (
        <fieldset
          key={item.id}
          className="rounded-md border border-neutral-200 p-4"
        >
          <input type="hidden" name="itemIds" value={item.id} />
          <legend className="px-1 text-sm font-medium">
            {item.productTitle} — {item.variantName}
          </legend>
          <p className="mb-2 text-sm text-neutral-600">
            Valeur définitive après inspection :{" "}
            <Price amountMinor={item.finalValueMinor} className="font-medium" />
          </p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`decision-${item.id}`}
                value="accept"
                defaultChecked
              />
              Accepter
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name={`decision-${item.id}`} value="reject" />
              Refuser
            </label>
          </div>
          <input
            name={`reason-${item.id}`}
            placeholder="Motif du refus (si refusé)"
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </fieldset>
      ))}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Envoi..." : "Confirmer ma décision"}
      </Button>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
