"use client";

import { useActionState } from "react";
import {
  confirmShipmentAction,
  type ActionState,
} from "@/features/buyback/actions";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function ConfirmShipmentForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    confirmShipmentAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-neutral-600">
        Indiquez l&rsquo;adresse depuis laquelle vous expédierez le colis.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="fullName"
          placeholder="Nom complet"
          required
          className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="line1"
          placeholder="Adresse"
          required
          className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="line2"
          placeholder="Complément (optionnel)"
          className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="postalCode"
          placeholder="Code postal"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="city"
          placeholder="Ville"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="country"
          placeholder="Pays (ex. BE)"
          defaultValue="BE"
          maxLength={2}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm uppercase"
        />
        <input
          name="phone"
          placeholder="Téléphone (optionnel)"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Confirmation..." : "Confirmer l'expédition"}
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
