import type { BuybackItemStatus, BuybackStatus } from "@/lib/db/client";
import { InvalidStateTransitionError } from "@/lib/errors";

// BUYBACK.md §1. CANCELLED is reachable from any state before RECEIVED
// (the customer can still back out before shipping anything back);
// everything from RECEIVED onward is a straight line through
// inspection/payout/reconditioning, since real goods and money are
// already in motion by then.
const ALLOWED_TRANSITIONS: Record<BuybackStatus, BuybackStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PRE_ESTIMATE", "CANCELLED"],
  PRE_ESTIMATE: ["AWAITING_SHIPMENT", "CANCELLED"],
  AWAITING_SHIPMENT: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["INSPECTION"],
  INSPECTION: ["VALUATION"],
  VALUATION: ["CUSTOMER_CONFIRMATION"],
  CUSTOMER_CONFIRMATION: [
    "ACCEPTED",
    "PARTIALLY_ACCEPTED",
    "REJECTED",
    "CANCELLED",
  ],
  ACCEPTED: ["PAYOUT_PENDING"],
  PARTIALLY_ACCEPTED: ["PAYOUT_PENDING"],
  REJECTED: [],
  CANCELLED: [],
  PAYOUT_PENDING: ["PAID"],
  PAID: ["RECONDITIONING"],
  RECONDITIONING: ["AVAILABLE_FOR_RESALE"],
  AVAILABLE_FOR_RESALE: [],
};

export function canTransitionBuyback(
  from: BuybackStatus,
  to: BuybackStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * BUYBACK.md §1: "any transition not in the table throws
 * InvalidStateTransitionError" - unlike the other state machines'
 * boolean `canTransition*`, the buyback flow calls this directly at
 * the top of each service mutation so an illegal transition fails
 * loudly rather than being silently skipped.
 */
export function assertBuybackTransition(
  from: BuybackStatus,
  to: BuybackStatus,
): void {
  if (!canTransitionBuyback(from, to)) {
    throw new InvalidStateTransitionError(
      `La demande de rachat ne peut pas passer de ${from} à ${to}.`,
    );
  }
}

/**
 * BUYBACK.md §2: the parent BuybackRequest status is always derived
 * from its items' individual outcomes, never hand-set independently -
 * this is the one place that derivation happens. Callers must only
 * invoke this once every item has left PENDING (BuybackItem.status is
 * ACCEPTED or REJECTED for all of them); a request with fewer than one
 * decided item is a caller bug, not a valid derivation input.
 */
export function deriveRequestStatusFromItems(
  itemStatuses: BuybackItemStatus[],
): "ACCEPTED" | "PARTIALLY_ACCEPTED" | "REJECTED" {
  const pending = itemStatuses.filter((status) => status === "PENDING").length;
  if (pending > 0 || itemStatuses.length === 0) {
    throw new InvalidStateTransitionError(
      "Impossible de dériver le statut de la demande : tous les articles doivent avoir été inspectés.",
    );
  }

  const accepted = itemStatuses.filter(
    (status) => status === "ACCEPTED",
  ).length;
  const rejected = itemStatuses.filter(
    (status) => status === "REJECTED",
  ).length;

  if (rejected === 0) return "ACCEPTED";
  if (accepted === 0) return "REJECTED";
  return "PARTIALLY_ACCEPTED";
}
