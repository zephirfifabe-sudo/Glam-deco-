import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthorizedError } from "@/lib/errors";
import * as reconditioningService from "@/server/services/buyback/reconditioningService";
import { ReconditioningForm } from "@/features/buyback/ReconditioningForm";

export const metadata = { title: "Reconditionnement des rachats" };

export default async function ReconditioningQueuePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/personnel/rachat/reconditionnement");
  }
  const actor = { id: session.user.id, roles: session.user.roles };

  let requests;
  try {
    requests = await reconditioningService.getReconditioningQueue(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return (
        <p className="text-neutral-600">
          Votre compte n&rsquo;a pas la permission (inventory.write) pour
          accéder au reconditionnement.
        </p>
      );
    }
    throw error;
  }

  const paidRequests = requests.filter((request) => request.status === "PAID");

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">
        Demandes payées à reconditionner ({paidRequests.length})
      </h1>
      <div className="flex flex-col gap-8">
        {paidRequests.map((request) => (
          <div
            key={request.id}
            className="rounded-lg border border-neutral-200 p-4"
          >
            <p className="mb-3 text-xs text-neutral-500">
              Demande #{request.id.slice(-8)}
            </p>
            <ReconditioningForm
              requestId={request.id}
              items={request.items
                .filter((item) => item.status === "ACCEPTED")
                .map((item) => ({
                  id: item.id,
                  productTitle: item.productVariant.product.title,
                  variantName: item.productVariant.name,
                  observedCondition:
                    item.inspection?.observedCondition ??
                    item.declaredCondition,
                }))}
            />
          </div>
        ))}
        {paidRequests.length === 0 && (
          <p className="text-neutral-600">Aucune demande à reconditionner.</p>
        )}
      </div>
    </div>
  );
}
