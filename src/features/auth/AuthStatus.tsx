import Link from "next/link";
import type { Session } from "next-auth";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/Button";

// `session.user` is typed as always-present, but the revoked/expired
// branch of the `session` callback (ADR-003) returns it as `undefined`
// at runtime - so this checks defensively rather than trusting the type.
export function AuthStatus({ session }: { session: Session | null }) {
  const user = session?.user;

  if (!user) {
    return (
      <div className="flex gap-3 text-sm">
        <Link href="/connexion" className="hover:underline">
          Connexion
        </Link>
        <Link href="/inscription" className="hover:underline">
          Créer un compte
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm text-neutral-600">
      <span>{user.email}</span>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" className="px-3 py-1.5">
          Déconnexion
        </Button>
      </form>
    </div>
  );
}
