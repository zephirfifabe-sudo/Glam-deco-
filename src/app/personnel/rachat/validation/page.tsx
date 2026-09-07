import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthorizedError } from "@/lib/errors";
import * as inspectionService from "@/server/services/buyback/inspectionService";
import { Price } from "@/components/ui/Price";
import { ApproveValuationButton } from "@/features/buyback/ApproveValuationButton";

export const metadata = { title: "Validation des estimations" };

export default async function ValuationApprovalQueuePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/personnel/rachat/validation");
  }
  const actor = { id: session.user.id, roles: session.user.roles };

  let requests;
  try {
    requests = await inspectionService.getValuationApprovalQueue(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return (
        <p className="text-neutral-600">
          Votre compte n&rsquo;a pas la permission (buyback.approve) pour
          valider les estimations de rachat.
        </p>
      );
    }
    throw error;
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">
        Estimations en attente de validation ({requests.length})
      </h1>
      <div className="flex flex-col gap-6">
        {requests.map((request) => (
          <div
            key={request.id}
            className="rounded-lg border border-neutral-200 p-4"
          >
            <p className="mb-2 text-xs text-neutral-500">
              Demande #{request.id.slice(-8)}
            </p>
            <ul className="mb-3 divide-y divide-neutral-100">
              {request.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    {item.productVariant.product.title} —{" "}
                    {item.productVariant.name}
                    {item.inspection?.discrepancyFlag && (
                      <span className="ml-2 text-amber-700">
                        (écart déclaré/observé)
                      </span>
                    )}
                  </span>
                  <Price amountMinor={item.finalValueMinor ?? 0} />
                </li>
              ))}
            </ul>
            <ApproveValuationButton requestId={request.id} />
          </div>
        ))}
        {requests.length === 0 && (
          <p className="text-neutral-600">Aucune estimation en attente.</p>
        )}
      </div>
    </div>
  );
}
