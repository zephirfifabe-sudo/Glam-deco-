import { describe, expect, it } from "vitest";
import { stripe } from "@/lib/stripe/client";

// Validates the actual signature-verification mechanism the webhook
// route depends on (ADR-004/SECURITY.md §11) - a forged or tampered
// payload must be rejected before any business logic runs. This needs
// no network access: generateTestHeaderString/constructEvent are pure
// local HMAC operations against STRIPE_WEBHOOK_SECRET.

const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

describe("Stripe webhook signature verification (fail closed)", () => {
  it("accepts a payload signed with the configured webhook secret", () => {
    const payload = JSON.stringify({
      id: "evt_test",
      type: "checkout.session.completed",
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const event = stripe.webhooks.constructEvent(payload, header, secret);
    expect(event.id).toBe("evt_test");
  });

  it("rejects a payload signed with the wrong secret", () => {
    const payload = JSON.stringify({
      id: "evt_test",
      type: "checkout.session.completed",
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_a_completely_different_secret",
    });

    expect(() =>
      stripe.webhooks.constructEvent(payload, header, secret),
    ).toThrow();
  });

  it("rejects a tampered payload even with a validly-formatted signature header", () => {
    const originalPayload = JSON.stringify({
      id: "evt_test",
      type: "checkout.session.completed",
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret,
    });

    // Attacker (or a buggy proxy) alters the body after signing -
    // constructEvent must catch this, not just check the header shape.
    const tamperedPayload = JSON.stringify({
      id: "evt_test",
      type: "checkout.session.completed",
      data: { object: { id: "attacker-controlled" } },
    });

    expect(() =>
      stripe.webhooks.constructEvent(tamperedPayload, header, secret),
    ).toThrow();
  });

  it("rejects a request with no signature header at all", () => {
    const payload = JSON.stringify({ id: "evt_test" });
    expect(() => stripe.webhooks.constructEvent(payload, "", secret)).toThrow();
  });
});
