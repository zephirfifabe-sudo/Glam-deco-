import { prisma } from "@/lib/db/client";
import {
  Prisma,
  type PaymentProvider,
  type PaymentStatus,
} from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function findPaymentByCheckoutSessionId(sessionId: string) {
  return prisma.payment.findUnique({
    where: { providerCheckoutSessionId: sessionId },
    include: { order: { include: { items: true } } },
  });
}

export async function setCheckoutSessionId(
  paymentId: string,
  sessionId: string,
) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: { providerCheckoutSessionId: sessionId },
  });
}

export async function updatePaymentStatus(
  tx: Tx,
  id: string,
  status: PaymentStatus,
) {
  return tx.payment.update({ where: { id }, data: { status } });
}

export interface PaymentEventInput {
  paymentId: string;
  provider: PaymentProvider;
  eventId: string;
  type: string;
  payloadHash: string;
}

/**
 * Returns true if this is a genuinely new event that should be
 * applied, false if (provider, eventId) already exists - i.e. Stripe
 * (or a replay attacker in possession of a captured valid payload)
 * delivered the same event twice. The unique constraint is what makes
 * this safe under concurrent webhook deliveries, not the existence
 * check alone (brief §24/§69, ADR-004).
 */
export async function recordPaymentEventIfNew(
  tx: Tx,
  input: PaymentEventInput,
): Promise<boolean> {
  try {
    await tx.paymentEvent.create({
      data: { ...input, appliedAt: new Date() },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}
