"use client";

import { useActionState } from "react";
import {
  createEventTypeAction,
  type ActionState,
} from "@/features/catalog/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function EventTypeForm() {
  const [state, formAction, pending] = useActionState(
    createEventTypeAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      <Input label="Nom du type d'événement" name="name" required />
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
