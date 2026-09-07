"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/features/catalog/actions";
import type { Category, EventType } from "@/lib/db/client";

interface ProductFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  categories: Category[];
  eventTypes: EventType[];
  defaultValues?: {
    title: string;
    description: string;
    priceEuros: number;
    condition: "NEW" | "USED";
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    categoryId: string;
    personalizationRequired: boolean;
    personalizationBuybackEligible: boolean;
    eventTypeIds: string[];
    variantsRaw: string;
    imagesRaw: string;
  };
  submitLabel: string;
}

const initialState: ActionState = { status: "idle" };

export function ProductForm({
  action,
  categories,
  eventTypes,
  defaultValues,
  submitLabel,
}: ProductFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <Input
        label="Titre"
        name="title"
        defaultValue={defaultValues?.title}
        required
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="description"
          className="text-sm font-medium text-neutral-700"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaultValues?.description}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <Input
        label="Prix (EUR)"
        name="priceEuros"
        type="number"
        step="0.01"
        min="0"
        defaultValue={defaultValues?.priceEuros}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="condition"
            className="text-sm font-medium text-neutral-700"
          >
            État
          </label>
          <select
            id="condition"
            name="condition"
            defaultValue={defaultValues?.condition ?? "NEW"}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="NEW">Neuf</option>
            <option value="USED">Occasion</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="status"
            className="text-sm font-medium text-neutral-700"
          >
            Statut
          </label>
          <select
            id="status"
            name="status"
            defaultValue={defaultValues?.status ?? "DRAFT"}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="DRAFT">Brouillon</option>
            <option value="ACTIVE">Actif (visible sur le site)</option>
            <option value="ARCHIVED">Archivé</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="categoryId"
          className="text-sm font-medium text-neutral-700"
        >
          Catégorie
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={defaultValues?.categoryId}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Choisir...</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-neutral-700">
          Types d&rsquo;événement
        </legend>
        <div className="flex flex-wrap gap-3">
          {eventTypes.map((eventType) => (
            <label
              key={eventType.id}
              className="flex items-center gap-1.5 text-sm"
            >
              <input
                type="checkbox"
                name="eventTypeIds"
                value={eventType.id}
                defaultChecked={defaultValues?.eventTypeIds.includes(
                  eventType.id,
                )}
              />
              {eventType.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="personalizationRequired"
          value="true"
          defaultChecked={defaultValues?.personalizationRequired}
        />
        Produit personnalisable (prénom, date, texte...)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="personalizationBuybackEligible"
          value="true"
          defaultChecked={defaultValues?.personalizationBuybackEligible}
        />
        Exception : autoriser le rachat malgré la personnalisation (BUYBACK.md
        §3 - désactivé par défaut)
      </label>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="variantsRaw"
          className="text-sm font-medium text-neutral-700"
        >
          Variantes (une par ligne : SKU;Nom;Prix optionnel en EUR)
        </label>
        <textarea
          id="variantsRaw"
          name="variantsRaw"
          rows={3}
          placeholder="ARCHE-BLANC-2M;Blanc / 2m"
          defaultValue={defaultValues?.variantsRaw}
          className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-neutral-500">
          Laisser vide pour générer une variante unique automatiquement.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="imagesRaw"
          className="text-sm font-medium text-neutral-700"
        >
          Photos (une par ligne : URL;Texte alternatif)
        </label>
        <textarea
          id="imagesRaw"
          name="imagesRaw"
          rows={3}
          placeholder="https://.../photo.jpg;Arche florale blanche"
          defaultValue={defaultValues?.imagesRaw}
          className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-neutral-500">
          Pipeline d&rsquo;upload sécurisé (ADR-006) à venir - URL directe pour
          l&rsquo;instant.
        </p>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Enregistrement..." : submitLabel}
      </Button>
    </form>
  );
}
