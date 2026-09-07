import { RequestResetForm } from "./RequestResetForm";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <h1 className="font-serif text-2xl">Mot de passe oublié</h1>
      <RequestResetForm />
    </main>
  );
}
