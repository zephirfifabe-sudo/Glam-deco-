import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import * as buybackService from "@/server/services/buyback/buybackService";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { AddBuybackItemForm } from "@/features/buyback/AddBuybackItemForm";
import { ConfirmShipmentForm } from "@/features/buyback/ConfirmShipmentForm";

export const metadata = { title: "Rachat de mes articles" };

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

export default async function BuybackPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/rachat");
  }

  const userId = session.user.id;
  const [purchases, requests] = await Promise.all([
    buybackService.getEligiblePurchasesForBuyback(userId),
    buybackService.getMyBuybackRequests(userId),
  ]);

  const openRequest = requests.find((request) =>
    ["DRAFT", "SUBMITTED", "PRE_ESTIMATE"].includes(request.status),
  );
  const otherRequests = requests.filter(
    (request) => request.id !== openRequest?.id,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 font-serif text-2xl">Rachat de mes articles</h1>
      <p className="mb-8 text-sm text-neutral-600">
        Vendez-nous les articles que vous nous avez achetés. Une estimation
        indicative vous est proposée avant toute expédition ; la valeur
        définitive n&rsquo;est fixée qu&rsquo;après inspection.
      </p>

      <section className="mb-10 rounded-lg border border-neutral-200 p-6">
        <h2 className="mb-4 font-serif text-lg">
          Ajouter un article à racheter
        </h2>
        <AddBuybackItemForm purchases={purchases} />
      </section>

      {openRequest && (
        <section className="mb-10 rounded-lg border border-neutral-200 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg">Demande en cours</h2>
            <Badge tone="neutral">
              {STATUS_LABELS[openRequest.status] ?? openRequest.status}
            </Badge>
          </div>

          <ul className="mb-6 divide-y divide-neutral-200">
            {openRequest.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">
                    {item.productVariant.product.title}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {item.productVariant.name}
                  </p>
                </div>
                {item.preEstimateMinMinor !== null &&
                  item.preEstimateMaxMinor !== null && (
                    <p className="text-sm text-neutral-600">
                      Estimation indicative :{" "}
                      <Price amountMinor={item.preEstimateMinMinor} />
                      {" – "}
                      <Price amountMinor={item.preEstimateMaxMinor} />
                    </p>
                  )}
              </li>
            ))}
          </ul>

          <ConfirmShipmentForm requestId={openRequest.id} />
        </section>
      )}

      {otherRequests.length > 0 && (
        <section>
          <h2 className="mb-4 font-serif text-lg">Historique</h2>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {otherRequests.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between p-4"
              >
                <div>
                  <Link
                    href={`/rachat/${request.id}`}
                    className="font-medium hover:underline"
                  >
                    Demande #{request.id.slice(-8)}
                  </Link>
                  <p className="text-sm text-neutral-500">
                    {request.items.length} article(s)
                  </p>
                </div>
                <Badge tone="neutral">
                  {STATUS_LABELS[request.status] ?? request.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
