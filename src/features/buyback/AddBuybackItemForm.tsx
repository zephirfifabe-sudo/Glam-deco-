"use client";

import { useActionState } from "react";
import {
  addBuybackItemAction,
  type ActionState,
} from "@/features/buyback/actions";
import { Button } from "@/components/ui/Button";
import type { EligiblePurchase } from "@/server/services/buyback/buybackService";

const initialState: ActionState = { status: "idle" };

const CONDITION_LABELS: Record<string, string> = {
  NEW: "Neuf",
  LIKE_NEW: "Comme neuf",
  EXCELLENT: "Excellent",
  GOOD: "Bon état",
  FAIR: "État correct",
  DAMAGED: "Endommagé",
  INCOMPLETE: "Incomplet",
  UNUSABLE: "Inutilisable",
};

export function AddBuybackItemForm({
  purchases,
}: {
  purchases: EligiblePurchase[];
}) {
  const [state, formAction, pending] = useActionState(
    addBuybackItemAction,
    initialState,
  );

  if (purchases.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Aucun de vos achats n&rsquo;est actuellement éligible au rachat.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="purchase"
          className="text-xs font-medium text-neutral-600"
        >
          Article acheté
        </label>
        <select
          id="purchase"
          name="purchase"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          onChange={(event) => {
            const [productVariantId, orderItemId] =
              event.currentTarget.value.split("|");
            const variantInput = event.currentTarget.form?.elements.namedItem(
              "productVariantId",
            ) as HTMLInputElement | null;
            const orderItemInput = event.currentTarget.form?.elements.namedItem(
              "originalOrderItemId",
            ) as HTMLInputElement | null;
            if (variantInput) variantInput.value = productVariantId ?? "";
            if (orderItemInput) orderItemInput.value = orderItemId ?? "";
          }}
          defaultValue={`${purchases[0]?.productVariantId}|${purchases[0]?.orderItemId}`}
        >
          {purchases.map((purchase) => (
            <option
              key={purchase.orderItemId}
              value={`${purchase.productVariantId}|${purchase.orderItemId}`}
            >
              {purchase.productTitle} — {purchase.variantName}
            </option>
          ))}
        </select>
      </div>

      <input
        type="hidden"
        name="productVariantId"
        defaultValue={purchases[0]?.productVariantId}
      />
      <input
        type="hidden"
        name="originalOrderItemId"
        defaultValue={purchases[0]?.orderItemId}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="declaredCondition"
          className="text-xs font-medium text-neutral-600"
        >
          État déclaré
        </label>
        <select
          id="declaredCondition"
          name="declaredCondition"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          defaultValue="GOOD"
        >
          {Object.entries(CONDITION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="declaredNotes"
          className="text-xs font-medium text-neutral-600"
        >
          Notes (optionnel)
        </label>
        <textarea
          id="declaredNotes"
          name="declaredNotes"
          rows={2}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Détails sur l'état, accessoires inclus..."
        />
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Ajout..." : "Ajouter à ma demande de rachat"}
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
