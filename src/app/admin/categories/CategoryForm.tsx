"use client";

import { useActionState } from "react";
import {
  createCategoryAction,
  type ActionState,
} from "@/features/catalog/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function CategoryForm() {
  const [state, formAction, pending] = useActionState(
    createCategoryAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      <Input label="Nom de la catégorie" name="name" required />
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
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Création..." : "Ajouter"}
      </Button>
    </form>
  );
}
