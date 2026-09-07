"use client";

import { useActionState } from "react";
import { verifyEmailAction, type ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = { status: "idle" };

// Deliberately requires an explicit click rather than verifying on page
// load: some corporate email scanners/"safe link" prefetchers follow
// links automatically, which would silently burn a single-use token
// before the real user ever sees the page.
export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    verifyEmailAction,
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
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Confirmation..." : "Confirmer mon email"}
      </Button>
    </form>
  );
}
