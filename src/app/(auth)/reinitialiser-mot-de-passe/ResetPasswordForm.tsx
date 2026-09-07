"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ActionState } from "@/features/auth/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
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
      <input type="hidden" name="token" value={token} />
      <Input
        label="Nouveau mot de passe"
        name="password"
        type="password"
        minLength={10}
        required
        autoFocus
      />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Mise à jour..." : "Réinitialiser le mot de passe"}
      </Button>
    </form>
  );
}
