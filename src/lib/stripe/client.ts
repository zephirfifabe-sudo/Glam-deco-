import Stripe from "stripe";

// Server-only - STRIPE_SECRET_KEY must never reach a Client Component
// or NEXT_PUBLIC_* (SECURITY.md §12/ADR-004). Pinned apiVersion so a
// Stripe-side default change can't silently alter behavior.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});
