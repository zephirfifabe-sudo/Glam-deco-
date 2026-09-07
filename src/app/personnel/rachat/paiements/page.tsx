import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthorizedError } from "@/lib/errors";
import * as payoutService from "@/server/services/buyback/payoutService";
import { Price } from "@/components/ui/Price";
import { ReleasePayoutForm } from "@/features/buyback/ReleasePayoutForm";

export const metadata = { title: "Paiements de rachat" };

export default async function PendingPayoutsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/personnel/rachat/paiements");
  }
  const actor = { id: session.user.id, roles: session.user.roles };

  let payouts;
  try {
    payouts = await payoutService.getPendingPayouts(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return (
        <p className="text-neutral-600">
          Votre compte n&rsquo;a pas la permission (payout.approve) pour gérer
          les paiements de rachat.
        </p>
      );
    }
    throw error;
  }

  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl">
        Paiements en attente ({payouts.length})
      </h1>
      <p className="mb-6 text-sm text-neutral-600">
        Contrôle à deux (BUYBACK.md §7) : la personne qui libère un paiement
        doit être différente de celle qui a validé l&rsquo;estimation.
      </p>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {payouts.map((payout) => (
          <li key={payout.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">
                Demande #{payout.buybackRequestId.slice(-8)}
              </p>
              <Price amountMinor={payout.amountMinor} className="text-sm" />
            </div>
            <ReleasePayoutForm payoutId={payout.id} />
          </li>
        ))}
        {payouts.length === 0 && (
          <li className="p-4 text-neutral-600">Aucun paiement en attente.</li>
        )}
      </ul>
    </div>
  );
}
