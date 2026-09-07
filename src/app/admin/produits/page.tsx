import Link from "next/link";
import { listProductsForAdmin } from "@/server/services/catalog/productService";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";

export const metadata = { title: "Admin - Produits" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

const STATUS_TONE = {
  DRAFT: "neutral",
  ACTIVE: "success",
  ARCHIVED: "warning",
} as const;

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const page = Number(pageParam) || 1;
  const { items, total, pageCount } = await listProductsForAdmin(page);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl">Produits ({total})</h1>
        <Link
          href="/admin/produits/nouveau"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Nouveau produit
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2">Titre</th>
              <th className="px-4 py-2">Catégorie</th>
              <th className="px-4 py-2">État</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Prix</th>
            </tr>
          </thead>
          <tbody>
            {items.map((product) => (
              <tr key={product.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/produits/${product.id}`}
                    className="hover:underline"
                  >
                    {product.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  {product.category.name}
                </td>
                <td className="px-4 py-2">
                  {product.condition === "NEW" ? "Neuf" : "Occasion"}
                </td>
                <td className="px-4 py-2">
                  <Badge tone={STATUS_TONE[product.status]}>
                    {product.status}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <Price
                    amountMinor={product.basePriceMinor}
                    currency={product.currency}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/admin/produits", query: { page: p } }}
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
    </div>
  );
}
