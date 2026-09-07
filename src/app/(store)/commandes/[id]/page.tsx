import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { requireOwnerOrPermission } from "@/lib/permissions/permissionService";
import { getOrderById } from "@/server/services/orders/orderService";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { UnauthorizedError } from "@/lib/errors";

export const metadata = { title: "Ma commande" };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paiement?: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "En attente de paiement",
  PAID: "Payée",
  PROCESSING: "En préparation",
  READY_TO_SHIP: "Prête à expédier",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { paiement } = await searchParams;

  const session = await auth();
  if (!session?.user) {
    redirect(`/connexion?callbackUrl=/commandes/${id}`);
  }

  const order = await getOrderById(id);
  if (!order) {
    notFound();
  }

  const actor = { id: session.user.id, roles: session.user.roles };
  try {
    await requireOwnerOrPermission(actor, order.userId, "order.read");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      notFound(); // Never confirm the resource exists to a non-owner (THREAT_MODEL.md §2).
    }
    throw error;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 font-serif text-2xl">
        Commande #{order.id.slice(-8)}
      </h1>
      <Badge
        tone={order.status === "PAID" ? "success" : "neutral"}
        className="mb-6 w-fit"
      >
        {STATUS_LABELS[order.status] ?? order.status}
      </Badge>

      {paiement === "succes" && order.status === "PENDING_PAYMENT" && (
        <p className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Paiement en cours de confirmation - cette page se mettra à jour dès
          réception de la confirmation par notre système (généralement en
          quelques secondes).
        </p>
      )}
      {paiement === "annule" && (
        <p className="mb-6 rounded-md bg-neutral-100 p-3 text-sm text-neutral-700">
          Paiement annulé. Votre commande n&rsquo;a pas été débitée.
        </p>
      )}

      <ul className="mb-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{item.productVariant.product.title}</p>
              <p className="text-sm text-neutral-500">
                {item.productVariant.name}
              </p>
            </div>
            <Price
              amountMinor={item.unitPriceMinor * item.quantity}
              currency={order.currency}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-end gap-1 text-sm text-neutral-600">
        <p>
          Sous-total :{" "}
          <Price amountMinor={order.subtotalMinor} currency={order.currency} />
        </p>
        <p className="text-base font-semibold text-neutral-900">
          Total :{" "}
          <Price amountMinor={order.totalMinor} currency={order.currency} />
        </p>
      </div>
    </main>
  );
}
