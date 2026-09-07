"use client";

import { useActionState } from "react";
import {
  completeReconditioningAction,
  type ActionState,
} from "@/features/buyback/staffActions";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

const CONDITION_OPTIONS = [
  "NEW",
  "LIKE_NEW",
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "DAMAGED",
];

export interface AcceptedItem {
  id: string;
  productTitle: string;
  variantName: string;
  observedCondition: string;
}

export function ReconditioningForm({
  requestId,
  items,
}: {
  requestId: string;
  items: AcceptedItem[];
}) {
  const [state, formAction, pending] = useActionState(
    completeReconditioningAction,
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

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex flex-col gap-1">
              Condition finale
              <select
                name={`condition-${item.id}`}
                defaultValue={item.observedCondition}
                className="rounded-md border border-neutral-300 px-2 py-1"
              >
                {CONDITION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Photos (une URL par ligne, au moins une)
              <textarea
                name={`photos-${item.id}`}
                rows={2}
                required
                className="rounded-md border border-neutral-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              Prix de revente (centimes)
              <input
                name={`price-${item.id}`}
                type="number"
                min={1}
                required
                className="rounded-md border border-neutral-300 px-2 py-1"
              />
            </label>
          </div>
        </fieldset>
      ))}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Envoi..." : "Terminer le reconditionnement"}
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
