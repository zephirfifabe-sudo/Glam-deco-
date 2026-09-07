"use client";

import { useActionState } from "react";
import { signUpAction, type ActionState } from "@/features/auth/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(
    signUpAction,
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
      <Input label="Nom" name="name" type="text" required autoFocus />
      <Input label="Email" name="email" type="email" required />
      <Input
        label="Mot de passe"
        name="password"
        type="password"
        minLength={10}
        required
      />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Création..." : "Créer mon compte"}
      </Button>
    </form>
  );
}
