import type { Metadata } from "next";
import Link from "next/link";
import { listPublicProducts } from "@/server/services/catalog/productService";
import {
  listCategories,
  listEventTypes,
} from "@/server/services/catalog/taxonomyService";
import { ProductCard } from "@/features/catalog/ProductCard";
import { CatalogFilters } from "./CatalogFilters";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Décorations événementielles neuves et d'occasion inspectées - mariage, baby shower, anniversaire.",
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    categorie?: string;
    evenement?: string;
    etat?: string;
    page?: string;
  }>;
}

export default async function CataloguePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const condition =
    params.etat === "NEW" || params.etat === "USED" ? params.etat : undefined;
  const page = Number(params.page) || 1;

  const [{ items, total, pageCount }, categories, eventTypes] =
    await Promise.all([
      listPublicProducts(
        {
          query: params.q || undefined,
          categorySlug: params.categorie || undefined,
          eventTypeSlug: params.evenement || undefined,
          condition,
        },
        page,
      ),
      listCategories(),
      listEventTypes(),
    ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="mb-6 font-serif text-3xl">Catalogue</h1>
      <div className="mb-8">
        <CatalogFilters
          categories={categories}
          eventTypes={eventTypes}
          current={{
            query: params.q,
            categorySlug: params.categorie,
            eventTypeSlug: params.evenement,
            condition: params.etat,
          }}
        />
      </div>

      <p className="mb-4 text-sm text-neutral-500">
        {total} {total > 1 ? "résultats" : "résultat"}
      </p>

      {items.length === 0 ? (
        <p className="text-neutral-500">
          Aucun produit ne correspond à ces critères.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="mt-8 flex justify-center gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/catalogue", query: { ...params, page: p } }}
              className={
                p === page
                  ? "rounded-md bg-brand-500 px-3 py-1.5 text-white"
                  : "rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100"
              }
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </main>
  );
}
