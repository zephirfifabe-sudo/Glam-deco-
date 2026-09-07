import { prisma } from "@/lib/db/client";
import {
  InvalidStateTransitionError,
  UnauthorizedError,
  ValidationFailedError,
} from "@/lib/errors";
import type { Actor } from "@/lib/permissions/permissionService";
import { requirePermission } from "@/lib/permissions/permissionService";
import { assertBuybackTransition } from "@/server/domain/buyback/stateMachine";
import * as buybackRepo from "@/server/repositories/buyback/buybackRepository";
import * as payoutRepo from "@/server/repositories/buyback/payoutRepository";

export async function getPendingPayouts(
  actor: Actor,
): Promise<payoutRepo.PayoutWithDetails[]> {
  await requirePermission(actor, "payout.approve");
  return payoutRepo.listPendingPayouts();
}

/**
 * The "checker" half of maker-checker (BUYBACK.md §7, brief
 * §41/§82/§102): whoever created/approved the valuation
 * (Payout.preparedById) may never also be the one who releases the
 * money, enforced here as a hard rule for every payout - the MVP has
 * no BuybackRule "high-value threshold" field yet to carve out a
 * same-person exception for small amounts, so enforcing it uniformly
 * is the safe simplification, not a shortcut.
 *
 * No real payout rail is wired up yet (ROADMAP.md known gap, same
 * class as Stripe's sandbox limitation) - release moves PENDING
 * straight to PAID rather than actually calling a bank transfer API,
 * with a PayoutEvent recording that this was a manual/simulated
 * release.
 */
export async function releasePayout(
  actor: Actor,
  payoutId: string,
): Promise<void> {
  await requirePermission(actor, "payout.approve");

  const payout = await payoutRepo.findPayoutById(payoutId);
  if (!payout) {
    throw new ValidationFailedError("Paiement introuvable.");
  }
  if (payout.status !== "PENDING") {
    throw new InvalidStateTransitionError(
      "Ce paiement n'est pas en attente de libération.",
    );
  }
  if (payout.preparedById === actor.id) {
    throw new UnauthorizedError(
      "La personne qui libère un paiement doit être différente de celle qui l'a préparé (contrôle à deux).",
    );
  }

  assertBuybackTransition("PAYOUT_PENDING", "PAID");

  await prisma.$transaction(async (tx) => {
    // Still passes through PROCESSING (BUYBACK.md §7's documented
    // PENDING -> PROCESSING -> PAID/FAILED/CANCELLED) even though both
    // updates land in the same transaction - there is no real payout
    // rail to actually wait on yet, but the ledger should still reflect
    // the intended state machine, not skip a step because it happens
    // to be instantaneous today.
    await payoutRepo.updatePayoutStatusInTx(tx, payout.id, "PROCESSING", {
      releasedBy: { connect: { id: actor.id } },
    });
    await payoutRepo.updatePayoutStatusInTx(tx, payout.id, "PAID");
    await payoutRepo.recordPayoutEventInTx(tx, {
      payoutId: payout.id,
      type: "RELEASED",
    });
    // The Payout being PAID is what actually settles the money side -
    // drive the parent BuybackRequest's own PAYOUT_PENDING -> PAID
    // transition from here rather than requiring a separate manual step.
    await buybackRepo.updateRequestStatusInTx(
      tx,
      payout.buybackRequestId,
      "PAID",
    );
  });
}

export async function cancelPayout(
  actor: Actor,
  payoutId: string,
  reason: string,
): Promise<void> {
  await requirePermission(actor, "payout.approve");

  const payout = await payoutRepo.findPayoutById(payoutId);
  if (!payout) {
    throw new ValidationFailedError("Paiement introuvable.");
  }
  if (payout.status !== "PENDING") {
    throw new InvalidStateTransitionError(
      "Seul un paiement en attente peut être annulé.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await payoutRepo.updatePayoutStatusInTx(tx, payout.id, "CANCELLED", {
      releasedBy: { connect: { id: actor.id } },
    });
    await payoutRepo.recordPayoutEventInTx(tx, {
      payoutId: payout.id,
      type: "CANCELLED",
      payload: { reason },
    });
  });
}
