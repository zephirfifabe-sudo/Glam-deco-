import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UnauthorizedError } from "@/lib/errors";
import * as buybackService from "@/server/services/buyback/buybackService";
import { ReceiveShipmentButton } from "@/features/buyback/ReceiveShipmentButton";

export const metadata = { title: "Réception des rachats" };

export default async function ReceptionQueuePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/connexion?callbackUrl=/personnel/rachat/reception");
  }
  const actor = { id: session.user.id, roles: session.user.roles };

  let requests;
  try {
    requests = await buybackService.getReceivingQueue(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return (
        <p className="text-neutral-600">
          Votre compte n&rsquo;a pas la permission (inventory.write) pour
          accéder à la réception des rachats.
        </p>
      );
    }
    throw error;
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl">
        Colis en attente de réception ({requests.length})
      </h1>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex items-center justify-between p-4"
          >
            <div>
              <p className="font-medium">Demande #{request.id.slice(-8)}</p>
              <p className="text-sm text-neutral-500">
                {request.items.length} article(s)
              </p>
            </div>
            <ReceiveShipmentButton requestId={request.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
