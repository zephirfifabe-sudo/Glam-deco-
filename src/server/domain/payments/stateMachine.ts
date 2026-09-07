import type { PaymentStatus } from "@/lib/db/client";

// Pure lookup table (ARCHITECTURE.md §2, brief §23).
const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PROCESSING", "SUCCEEDED", "FAILED"],
  PROCESSING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"],
  FAILED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  DISPUTED: ["SUCCEEDED", "REFUNDED"],
};

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
