import { describe, expect, it } from "vitest";
import { canTransitionPayment } from "@/server/domain/payments/stateMachine";

describe("Payment state machine (brief §23)", () => {
  it("allows PENDING -> SUCCEEDED", () => {
    expect(canTransitionPayment("PENDING", "SUCCEEDED")).toBe(true);
  });

  it("allows PENDING -> FAILED", () => {
    expect(canTransitionPayment("PENDING", "FAILED")).toBe(true);
  });

  it("forbids re-succeeding an already FAILED payment", () => {
    expect(canTransitionPayment("FAILED", "SUCCEEDED")).toBe(false);
  });

  it("forbids double-applying SUCCEEDED (idempotency backstop beyond the event ledger)", () => {
    expect(canTransitionPayment("SUCCEEDED", "SUCCEEDED")).toBe(false);
  });

  it("allows a dispute to resolve back to SUCCEEDED or into REFUNDED", () => {
    expect(canTransitionPayment("DISPUTED", "SUCCEEDED")).toBe(true);
    expect(canTransitionPayment("DISPUTED", "REFUNDED")).toBe(true);
  });
});
