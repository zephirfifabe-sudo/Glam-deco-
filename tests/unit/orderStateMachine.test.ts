import { describe, expect, it } from "vitest";
import { canTransitionOrder } from "@/server/domain/orders/stateMachine";

describe("Order state machine (brief §25/§107: no arbitrary status jumps)", () => {
  it("allows PENDING_PAYMENT -> PAID", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "PAID")).toBe(true);
  });

  it("allows PENDING_PAYMENT -> CANCELLED", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "CANCELLED")).toBe(true);
  });

  it("forbids DELIVERED -> PENDING_PAYMENT (brief §107's exact example)", () => {
    expect(canTransitionOrder("DELIVERED", "PENDING_PAYMENT")).toBe(false);
  });

  it("forbids skipping straight from PENDING_PAYMENT to SHIPPED", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "SHIPPED")).toBe(false);
  });

  it("treats CANCELLED and REFUNDED as terminal", () => {
    expect(canTransitionOrder("CANCELLED", "PAID")).toBe(false);
    expect(canTransitionOrder("REFUNDED", "PAID")).toBe(false);
  });
});
