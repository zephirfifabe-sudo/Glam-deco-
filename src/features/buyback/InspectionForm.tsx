"use client";

import { useActionState } from "react";
import {
  recordInspectionAction,
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
  "INCOMPLETE",
  "UNUSABLE",
];

export function InspectionForm({
  buybackItemId,
  declaredCondition,
}: {
  buybackItemId: string;
  declaredCondition: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordInspectionAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="buybackItemId" value={buybackItemId} />
      <p className="text-neutral-500">
        Condition déclarée : {declaredCondition}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          Reçu (qté)
          <input
            name="receivedQuantity"
            type="number"
            min={0}
            defaultValue={1}
            className="rounded-md border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Attendu (qté)
          <input
            name="expectedQuantity"
            type="number"
            min={1}
            defaultValue={1}
            className="rounded-md border border-neutral-300 px-2 py-1"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        Condition observée
        <select
          name="observedCondition"
          defaultValue={declaredCondition}
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
        Défauts (un par ligne)
        <textarea
          name="defects"
          rows={2}
          className="rounded-md border border-neutral-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        Pièces manquantes (une par ligne)
        <textarea
          name="missingParts"
          rows={2}
          className="rounded-md border border-neutral-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        Photos d&rsquo;inspection (une URL par ligne)
        <textarea
          name="inspectionPhotos"
          rows={2}
          className="rounded-md border border-neutral-300 px-2 py-1"
        />
      </label>

      <details>
        <summary className="cursor-pointer text-neutral-600">
          Forcer une valeur (justification requise)
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            Valeur forcée (centimes)
            <input
              name="overrideValueMinor"
              type="number"
              min={0}
              className="rounded-md border border-neutral-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Justification
            <input
              name="overrideJustification"
              className="rounded-md border border-neutral-300 px-2 py-1"
            />
          </label>
        </div>
      </details>

      <Button
        type="submit"
        disabled={pending}
        variant="secondary"
        className="w-fit"
      >
        {pending ? "Envoi..." : "Enregistrer l'inspection"}
      </Button>

      {state.status === "error" && (
        <p role="alert" className="text-red-600">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
