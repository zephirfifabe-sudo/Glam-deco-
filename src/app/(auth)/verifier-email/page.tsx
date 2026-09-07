import { VerifyEmailForm } from "./VerifyEmailForm";

export const metadata = { title: "Confirmer mon email" };

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <h1 className="font-serif text-2xl">Confirmer mon email</h1>
      {token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <p className="text-sm text-red-600">Lien invalide.</p>
      )}
    </main>
  );
}
