"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction, type ActionState } from "@/features/auth/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      router.push("/");
      router.refresh();
    }
  }, [state.status, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" required autoFocus />
      <Input label="Mot de passe" name="password" type="password" required />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Connexion..." : "Se connecter"}
      </Button>
    </form>
  );
}
