import { LinkButton } from "@/components/ui/Button";
import { auth } from "@/lib/auth/config";
import { AuthStatus } from "@/features/auth/AuthStatus";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-24 text-center">
      <div className="self-end">
        <AuthStatus session={session} />
      </div>
      <p className="text-sm font-medium uppercase tracking-wide text-brand-500">
        Belgique - décoration événementielle circulaire
      </p>
      <h1 className="font-serif text-4xl leading-tight text-neutral-900 sm:text-5xl">
        Décorez votre événement.
        <br />
        Donnez ensuite une seconde vie à vos décorations.
      </h1>
      <p className="max-w-2xl text-lg text-neutral-600">
        Achetez des décorations neuves ou d&rsquo;occasion inspectées,
        utilisez-les pour votre mariage, baby shower ou anniversaire, puis
        revendez-les à la plateforme.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <LinkButton href="/catalogue">Découvrir les décorations</LinkButton>
        <LinkButton href="/evenement" variant="secondary">
          Préparer mon événement
        </LinkButton>
        <LinkButton href="/rachat" variant="ghost">
          Revendre mes décorations
        </LinkButton>
      </div>
    </main>
  );
}
