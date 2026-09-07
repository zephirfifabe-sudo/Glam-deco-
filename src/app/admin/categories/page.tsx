import { listCategories } from "@/server/services/catalog/taxonomyService";
import { CategoryForm } from "./CategoryForm";

export const metadata = { title: "Admin - Catégories" };

export default async function AdminCategoriesPage() {
  const categories = await listCategories();

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">Catégories</h1>
      <ul className="mb-8 flex flex-col gap-1 text-sm">
        {categories.map((category) => (
          <li key={category.id} className="text-neutral-700">
            {category.name}{" "}
            <span className="text-neutral-400">({category.slug})</span>
          </li>
        ))}
      </ul>
      <CategoryForm />
    </div>
  );
}
