import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthorizedError } from "@/lib/errors";
import * as buybackService from "@/server/services/buyback/buybackService";
import { InspectionForm } from "@/features/buyback/InspectionForm";

export const metadata = { title: "Inspection des rachats" };

export default async function InspectionQueuePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/personnel/rachat/inspection");
  }
  const actor = { id: session.user.id, roles: session.user.roles };

  let requests;
  try {
    requests = await buybackService.getInspectionQueue(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return (
        <p className="text-neutral-600">
          Votre compte n&rsquo;a pas la permission (buyback.inspect) pour
          accéder à l&rsquo;inspection des rachats.
        </p>
      );
    }
    throw error;
  }

  const pendingItems = requests.flatMap((request) =>
    request.items
      .filter((item) => !item.inspection)
      .map((item) => ({ request, item })),
  );

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">
        Articles en attente d&rsquo;inspection ({pendingItems.length})
      </h1>
      <div className="flex flex-col gap-6">
        {pendingItems.map(({ request, item }) => (
          <div
            key={item.id}
            className="rounded-lg border border-neutral-200 p-4"
          >
            <p className="mb-1 text-xs text-neutral-500">
              Demande #{request.id.slice(-8)}
            </p>
            <p className="mb-3 font-medium">
              {item.productVariant.product.title} — {item.productVariant.name}
            </p>
            <InspectionForm
              buybackItemId={item.id}
              declaredCondition={item.declaredCondition}
            />
          </div>
        ))}
        {pendingItems.length === 0 && (
          <p className="text-neutral-600">
            Aucun article en attente d&rsquo;inspection.
          </p>
        )}
      </div>
    </div>
  );
}
