import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Créer un compte" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <h1 className="font-serif text-2xl">Créer un compte</h1>
      <SignUpForm />
      <Link
        href="/connexion"
        className="text-sm text-neutral-600 hover:underline"
      >
        Déjà un compte ? Se connecter
      </Link>
    </main>
  );
}
