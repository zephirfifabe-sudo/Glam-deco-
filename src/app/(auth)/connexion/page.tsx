import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <h1 className="font-serif text-2xl">Connexion</h1>
      <LoginForm />
      <div className="flex flex-col gap-1 text-sm text-neutral-600">
        <Link href="/mot-de-passe-oublie" className="hover:underline">
          Mot de passe oublié ?
        </Link>
        <Link href="/inscription" className="hover:underline">
          Créer un compte
        </Link>
      </div>
    </main>
  );
}
