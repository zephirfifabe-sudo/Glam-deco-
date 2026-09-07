"use client";

import { useActionState } from "react";
import { addToCartAction, type ActionState } from "@/features/cart/actions";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

interface Variant {
  id: string;
  name: string;
}

export function AddToCartForm({ variants }: { variants: Variant[] }) {
  const [state, formAction, pending] = useActionState(
    addToCartAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {variants.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="productVariantId"
            className="text-xs font-medium text-neutral-600"
          >
            Option
          </label>
          <select
            id="productVariantId"
            name="productVariantId"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="productVariantId" value={variants[0]?.id} />
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="quantity"
          className="text-xs font-medium text-neutral-600"
        >
          Quantité
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min={1}
          max={10}
          defaultValue={1}
          className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Ajout..." : "Ajouter au panier"}
      </Button>

      {state.status === "error" && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="w-full text-sm text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
