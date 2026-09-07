import { describe, expect, it } from "vitest";
import {
  assertBuybackTransition,
  canTransitionBuyback,
  deriveRequestStatusFromItems,
} from "@/server/domain/buyback/stateMachine";

describe("Buyback state machine (BUYBACK.md §1)", () => {
  it("allows the DRAFT -> SUBMITTED -> PRE_ESTIMATE -> AWAITING_SHIPMENT -> RECEIVED happy path", () => {
    expect(canTransitionBuyback("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionBuyback("SUBMITTED", "PRE_ESTIMATE")).toBe(true);
    expect(canTransitionBuyback("PRE_ESTIMATE", "AWAITING_SHIPMENT")).toBe(
      true,
    );
    expect(canTransitionBuyback("AWAITING_SHIPMENT", "RECEIVED")).toBe(true);
  });

  it("allows CANCELLED from any pre-RECEIVED state", () => {
    expect(canTransitionBuyback("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransitionBuyback("SUBMITTED", "CANCELLED")).toBe(true);
    expect(canTransitionBuyback("PRE_ESTIMATE", "CANCELLED")).toBe(true);
    expect(canTransitionBuyback("AWAITING_SHIPMENT", "CANCELLED")).toBe(true);
  });

  it("forbids CANCELLED once the request has been RECEIVED", () => {
    expect(canTransitionBuyback("RECEIVED", "CANCELLED")).toBe(false);
    expect(canTransitionBuyback("INSPECTION", "CANCELLED")).toBe(false);
  });

  it("forbids skipping straight from RECEIVED to CUSTOMER_CONFIRMATION", () => {
    expect(canTransitionBuyback("RECEIVED", "CUSTOMER_CONFIRMATION")).toBe(
      false,
    );
  });

  it("runs the post-acceptance pipeline: ACCEPTED -> PAYOUT_PENDING -> PAID -> RECONDITIONING -> AVAILABLE_FOR_RESALE", () => {
    expect(canTransitionBuyback("ACCEPTED", "PAYOUT_PENDING")).toBe(true);
    expect(canTransitionBuyback("PAYOUT_PENDING", "PAID")).toBe(true);
    expect(canTransitionBuyback("PAID", "RECONDITIONING")).toBe(true);
    expect(canTransitionBuyback("RECONDITIONING", "AVAILABLE_FOR_RESALE")).toBe(
      true,
    );
  });

  it("treats REJECTED and AVAILABLE_FOR_RESALE as terminal", () => {
    expect(canTransitionBuyback("REJECTED", "PAYOUT_PENDING")).toBe(false);
    expect(canTransitionBuyback("AVAILABLE_FOR_RESALE", "PAID")).toBe(false);
  });

  it("assertBuybackTransition throws InvalidStateTransitionError on an illegal jump", () => {
    expect(() => assertBuybackTransition("DRAFT", "PAID")).toThrow();
  });

  it("assertBuybackTransition does not throw on a legal transition", () => {
    expect(() => assertBuybackTransition("DRAFT", "SUBMITTED")).not.toThrow();
  });
});

describe("deriveRequestStatusFromItems (BUYBACK.md §2)", () => {
  it("derives ACCEPTED when every item was accepted", () => {
    expect(deriveRequestStatusFromItems(["ACCEPTED", "ACCEPTED"])).toBe(
      "ACCEPTED",
    );
  });

  it("derives REJECTED when every item was rejected", () => {
    expect(deriveRequestStatusFromItems(["REJECTED", "REJECTED"])).toBe(
      "REJECTED",
    );
  });

  it("derives PARTIALLY_ACCEPTED on a mixed outcome", () => {
    expect(deriveRequestStatusFromItems(["ACCEPTED", "REJECTED"])).toBe(
      "PARTIALLY_ACCEPTED",
    );
  });

  it("throws if any item is still PENDING", () => {
    expect(() =>
      deriveRequestStatusFromItems(["ACCEPTED", "PENDING"]),
    ).toThrow();
  });

  it("throws on an empty item list", () => {
    expect(() => deriveRequestStatusFromItems([])).toThrow();
  });
});
