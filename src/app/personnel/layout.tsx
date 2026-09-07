import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

// Distinct from /admin (gated on admin.access, held only by
// ADMIN/SUPER_ADMIN per SECURITY.md §2's default matrix): the buyback
// operational roles (INSPECTOR/WAREHOUSE/MANAGER/FINANCE) need
// somewhere to do their job without back-office access. This layout
// only requires being signed in - each page below checks its own
// specific permission (buyback.inspect/buyback.approve/payout.approve/
// inventory.write) via the service layer, and shows its own refusal
// message rather than a blanket gate here.
export default async function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/personnel/rachat/reception");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 p-6">
        <p className="mb-6 font-serif text-lg">Espace personnel</p>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/personnel/rachat/reception" className="hover:underline">
            Réception
          </Link>
          <Link href="/personnel/rachat/inspection" className="hover:underline">
            Inspection
          </Link>
          <Link href="/personnel/rachat/validation" className="hover:underline">
            Validation estimation
          </Link>
          <Link href="/personnel/rachat/paiements" className="hover:underline">
            Paiements
          </Link>
          <Link
            href="/personnel/rachat/reconditionnement"
            className="hover:underline"
          >
            Reconditionnement
          </Link>
        </nav>
      </aside>
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
