import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Réinitialiser le mot de passe" };

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <h1 className="font-serif text-2xl">Réinitialiser le mot de passe</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-red-600">Lien invalide.</p>
      )}
    </main>
  );
}
