"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type ActionState,
} from "@/features/auth/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <p className="text-sm text-green-700" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" required autoFocus />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Envoi..." : "Envoyer le lien de réinitialisation"}
      </Button>
    </form>
  );
}
