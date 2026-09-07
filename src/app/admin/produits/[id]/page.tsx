import { notFound } from "next/navigation";
import { getProductForAdmin } from "@/server/services/catalog/productService";
import {
  listCategories,
  listEventTypes,
} from "@/server/services/catalog/taxonomyService";
import { ProductForm } from "@/features/catalog/ProductForm";
import {
  updateProductAction,
  archiveProductAction,
} from "@/features/catalog/actions";

export const metadata = { title: "Admin - Modifier le produit" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const [product, categories, eventTypes] = await Promise.all([
    getProductForAdmin(id),
    listCategories(),
    listEventTypes(),
  ]);

  if (!product) {
    notFound();
  }

  const variantsRaw = product.variants
    .map((v) =>
      [v.sku, v.name, v.priceMinor ? (v.priceMinor / 100).toString() : ""].join(
        ";",
      ),
    )
    .join("\n");
  const imagesRaw = product.images
    .map((img) => [img.url, img.alt].join(";"))
    .join("\n");

  const boundUpdateAction = updateProductAction.bind(null, product.id);
  const boundArchiveAction = archiveProductAction.bind(null, product.id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl">Modifier : {product.title}</h1>
        {product.status !== "ARCHIVED" && (
          <form action={boundArchiveAction}>
            <button
              type="submit"
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              Archiver
            </button>
          </form>
        )}
      </div>
      <ProductForm
        action={boundUpdateAction}
        categories={categories}
        eventTypes={eventTypes}
        submitLabel="Enregistrer"
        defaultValues={{
          title: product.title,
          description: product.description,
          priceEuros: product.basePriceMinor / 100,
          condition: product.condition,
          status: product.status,
          categoryId: product.categoryId,
          personalizationRequired: product.personalizationRequired,
          personalizationBuybackEligible:
            product.personalizationBuybackEligible,
          eventTypeIds: product.eventTypes.map((e) => e.id),
          variantsRaw,
          imagesRaw,
        }}
      />
    </div>
  );
}
