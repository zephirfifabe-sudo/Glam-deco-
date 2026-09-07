import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { can } from "@/lib/permissions/permissionService";

// Every admin route goes through this guard - centralized here rather
// than repeated per page (SECURITY.md §2/§9: the back-office must be
// harder to reach than the storefront). Unauthenticated -> login;
// authenticated but lacking admin.access -> explicit refusal page,
// never a silent redirect that could confuse an admin about why they
// were bounced.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/connexion?callbackUrl=/admin");
  }

  const actor = { id: session.user.id, roles: session.user.roles };
  const hasAccess = await can(actor, "admin.access");

  if (!hasAccess) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">Accès refusé</h1>
        <p className="mt-2 text-neutral-600">
          Votre compte n&rsquo;a pas les permissions nécessaires pour accéder au
          back-office.
        </p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 p-6">
        <p className="mb-6 font-serif text-lg">Glam Déco Admin</p>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/admin" className="hover:underline">
            Tableau de bord
          </Link>
          <Link href="/admin/produits" className="hover:underline">
            Produits
          </Link>
          <Link href="/admin/categories" className="hover:underline">
            Catégories
          </Link>
          <Link href="/admin/types-evenement" className="hover:underline">
            Types d&rsquo;événement
          </Link>
        </nav>
      </aside>
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
