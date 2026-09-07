"use client";

import { useActionState } from "react";
import {
  removeFromCartAction,
  type ActionState,
} from "@/features/cart/actions";

const initialState: ActionState = { status: "idle" };

export function RemoveFromCartButton({
  productVariantId,
}: {
  productVariantId: string;
}) {
  const [, formAction, pending] = useActionState(
    removeFromCartAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="productVariantId" value={productVariantId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-neutral-500 hover:text-red-600 hover:underline"
      >
        Retirer
      </button>
    </form>
  );
}
