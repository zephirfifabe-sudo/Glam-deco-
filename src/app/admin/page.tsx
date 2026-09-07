export const metadata = { title: "Admin - Tableau de bord" };

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="font-serif text-2xl">Tableau de bord</h1>
      <p className="mt-2 text-neutral-600">
        Le tableau de bord chiffré (commandes, stock, rachats, paiements) arrive
        en Phase 7 - voir ROADMAP.md. Pour l&rsquo;instant, gérez le catalogue
        via le menu de gauche.
      </p>
    </div>
  );
}
