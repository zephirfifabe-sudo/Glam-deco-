import {
  listCategories,
  listEventTypes,
} from "@/server/services/catalog/taxonomyService";
import { ProductForm } from "@/features/catalog/ProductForm";
import { createProductAction } from "@/features/catalog/actions";

export const metadata = { title: "Admin - Nouveau produit" };

export default async function NewProductPage() {
  const [categories, eventTypes] = await Promise.all([
    listCategories(),
    listEventTypes(),
  ]);

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">Nouveau produit</h1>
      <ProductForm
        action={createProductAction}
        categories={categories}
        eventTypes={eventTypes}
        submitLabel="Créer le produit"
      />
    </div>
  );
}
