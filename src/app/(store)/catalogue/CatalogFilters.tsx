import type { Category, EventType } from "@/lib/db/client";

interface CatalogFiltersProps {
  categories: Category[];
  eventTypes: EventType[];
  current: {
    categorySlug?: string;
    eventTypeSlug?: string;
    condition?: string;
    query?: string;
  };
}

// A plain GET form (server-rendered, no client JS) - filters live in
// the URL so results are shareable/bookmarkable and indexable (brief §61).
export function CatalogFilters({
  categories,
  eventTypes,
  current,
}: CatalogFiltersProps) {
  return (
    <form className="flex flex-wrap items-end gap-3" action="/catalogue">
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-xs font-medium text-neutral-600">
          Recherche
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={current.query}
          placeholder="Arche, guirlande..."
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="categorie"
          className="text-xs font-medium text-neutral-600"
        >
          Catégorie
        </label>
        <select
          id="categorie"
          name="categorie"
          defaultValue={current.categorySlug ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Toutes</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="evenement"
          className="text-xs font-medium text-neutral-600"
        >
          Événement
        </label>
        <select
          id="evenement"
          name="evenement"
          defaultValue={current.eventTypeSlug ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Tous</option>
          {eventTypes.map((eventType) => (
            <option key={eventType.id} value={eventType.slug}>
              {eventType.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="etat" className="text-xs font-medium text-neutral-600">
          État
        </label>
        <select
          id="etat"
          name="etat"
          defaultValue={current.condition ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Neuf et occasion</option>
          <option value="NEW">Neuf</option>
          <option value="USED">Occasion</option>
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        Filtrer
      </button>
    </form>
  );
}
