"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { requirePermission } from "@/lib/permissions/permissionService";
import { parseFormDataOrThrow, parseOrThrow } from "@/lib/validation/parse";
import { UnauthenticatedError, toClientMessage } from "@/lib/errors";
import { logEvent } from "@/lib/logging/logger";
import {
  categoryFormSchema,
  eventTypeFormSchema,
  productFormSchema,
} from "@/features/catalog/schemas";
import * as productService from "@/server/services/catalog/productService";
import * as taxonomyService from "@/server/services/catalog/taxonomyService";
import { slugify } from "@/server/domain/catalog/slug";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

async function requireCatalogWriteAccess() {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError();
  }
  const actor = { id: session.user.id, roles: session.user.roles };
  await requirePermission(actor, "product.write");
  return actor;
}

function eventTypeIdsFromFormData(formData: FormData): string[] {
  return formData.getAll("eventTypeIds").map(String);
}

export async function createProductAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // redirect() throws a special Next.js control-flow error that must
  // NOT be swallowed by the catch block below - it is deliberately
  // called after the try/catch, not inside it.
  let createdProductId: string;
  try {
    const actor = await requireCatalogWriteAccess();
    const input = parseOrThrow(productFormSchema, {
      ...Object.fromEntries(formData.entries()),
      eventTypeIds: eventTypeIdsFromFormData(formData),
    });

    const product = await productService.createProduct(input);
    logEvent("catalog.product_created", {
      actorId: actor.id,
      resourceType: "Product",
      resourceId: product.id,
      result: "success",
    });
    createdProductId = product.id;
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(`/admin/produits/${createdProductId}`);
}

export async function updateProductAction(
  productId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireCatalogWriteAccess();
    const input = parseOrThrow(productFormSchema, {
      ...Object.fromEntries(formData.entries()),
      eventTypeIds: eventTypeIdsFromFormData(formData),
    });

    await productService.updateProduct(productId, input);
    logEvent("catalog.product_updated", {
      actorId: actor.id,
      resourceType: "Product",
      resourceId: productId,
      result: "success",
    });
    revalidatePath("/admin/produits");
    revalidatePath(`/admin/produits/${productId}`);
    revalidatePath("/catalogue");
    return { status: "success", message: "Produit mis à jour." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function archiveProductAction(productId: string): Promise<void> {
  const actor = await requireCatalogWriteAccess();
  await productService.archiveProduct(productId);
  logEvent("catalog.product_archived", {
    actorId: actor.id,
    resourceType: "Product",
    resourceId: productId,
    result: "success",
  });
  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect("/admin/produits");
}

export async function createCategoryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCatalogWriteAccess();
    const input = parseFormDataOrThrow(categoryFormSchema, formData);
    await taxonomyService.createCategory({
      slug: slugify(input.name),
      name: input.name,
    });
    revalidatePath("/admin/categories");
    return { status: "success", message: "Catégorie créée." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function createEventTypeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCatalogWriteAccess();
    const input = parseFormDataOrThrow(eventTypeFormSchema, formData);
    await taxonomyService.createEventType({
      slug: slugify(input.name),
      name: input.name,
    });
    revalidatePath("/admin/types-evenement");
    return { status: "success", message: "Type d'événement créé." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}
