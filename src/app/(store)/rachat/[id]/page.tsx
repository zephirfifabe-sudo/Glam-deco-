import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthorizedError } from "@/lib/errors";
import * as buybackService from "@/server/services/buyback/buybackService";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { ConfirmAcceptanceForm } from "@/features/buyback/ConfirmAcceptanceForm";

export const metadata = { title: "Ma demande de rachat" };

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumise",
  PRE_ESTIMATE: "Estimation indicative",
  AWAITING_SHIPMENT: "En attente d'expédition",
  RECEIVED: "Reçue",
  INSPECTION: "En cours d'inspection",
  VALUATION: "Estimation en cours de validation",
  CUSTOMER_CONFIRMATION: "En attente de votre confirmation",
  ACCEPTED: "Acceptée",
  PARTIALLY_ACCEPTED: "Partiellement acceptée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
  PAYOUT_PENDING: "Paiement en préparation",
  PAID: "Payée",
  RECONDITIONING: "Reconditionnement en cours",
  AVAILABLE_FOR_RESALE: "Remise en vente",
};

export default async function BuybackRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/connexion?callbackUrl=/rachat/${id}`);
  }

  let request;
  try {
    request = await buybackService.getBuybackRequestForOwner(
      session.user.id,
      id,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      notFound(); // Never confirm the resource exists to a non-owner (THREAT_MODEL.md §2).
    }
    throw error;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 font-serif text-2xl">
        Demande de rachat #{request.id.slice(-8)}
      </h1>
      <Badge tone="neutral" className="mb-6 w-fit">
        {STATUS_LABELS[request.status] ?? request.status}
      </Badge>

      <ul className="mb-8 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {request.items.map((item) => (
          <li key={item.id} className="p-4">
            <p className="font-medium">{item.productVariant.product.title}</p>
            <p className="text-sm text-neutral-500">
              {item.productVariant.name}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              Statut de l&rsquo;article :{" "}
              {item.status === "PENDING"
                ? "en attente"
                : item.status === "ACCEPTED"
                  ? "accepté"
                  : "refusé"}
            </p>
            {item.finalValueMinor !== null && (
              <p className="text-sm text-neutral-600">
                Valeur définitive : <Price amountMinor={item.finalValueMinor} />
              </p>
            )}
          </li>
        ))}
      </ul>

      {request.status === "CUSTOMER_CONFIRMATION" && (
        <section className="rounded-lg border border-neutral-200 p-6">
          <h2 className="mb-4 font-serif text-lg">
            Confirmez votre décision pour chaque article
          </h2>
          <ConfirmAcceptanceForm
            requestId={request.id}
            items={request.items.map((item) => ({
              id: item.id,
              productTitle: item.productVariant.product.title,
              variantName: item.productVariant.name,
              finalValueMinor: item.finalValueMinor ?? 0,
            }))}
          />
        </section>
      )}

      {request.payout && (
        <section className="mt-8 rounded-lg border border-neutral-200 p-6">
          <h2 className="mb-2 font-serif text-lg">Paiement</h2>
          <p className="text-sm text-neutral-600">
            Montant : <Price amountMinor={request.payout.amountMinor} />
          </p>
          <p className="text-sm text-neutral-600">
            Statut : {request.payout.status}
          </p>
        </section>
      )}
    </main>
  );
}
