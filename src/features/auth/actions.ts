"use server";

import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { generateRawToken, hashToken } from "@/lib/auth/tokens";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  emailVerificationTemplate,
  passwordResetTemplate,
} from "@/lib/email/templates";
import { signIn, signOut } from "@/lib/auth/config";
import { toClientMessage } from "@/lib/errors";
import { logEvent } from "@/lib/logging/logger";
import { parseOrThrow } from "@/lib/validation/parse";
import { appUrl } from "@/lib/appUrl";
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  signUpSchema,
  verifyEmailSchema,
} from "@/features/auth/schemas";

// SECURITY GAP (tracked, not hidden - brief §126): none of these actions
// are rate-limited yet. SECURITY.md §8 specifies strict limits for
// signup/login/password-reset/email-verification; that work is grouped
// into Phase 8 (Security Hardening) in ROADMAP.md, not this Foundation
// phase, but it MUST land before any production traffic is accepted.

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

async function issueEmailVerification(userId: string, email: string) {
  const rawToken = generateRawToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      purpose: "EMAIL_VERIFICATION",
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });
  const { subject, html } = emailVerificationTemplate(
    appUrl(`/verifier-email?token=${rawToken}`),
  );
  await sendEmail({ to: email, subject, html });
}

export async function signUpAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseOrThrow(signUpSchema, {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      // Signup (unlike password-reset requests) intentionally confirms
      // the email is taken - the UX benefit of telling a user "you
      // already have an account, log in instead" is standard practice;
      // the more sensitive enumeration surface (password reset) stays
      // generic below, per ADR-003/SECURITY.md §8.
      return {
        status: "error",
        message: "Un compte existe déjà avec cet email.",
      };
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        roles: { create: { role: "CUSTOMER" } },
      },
    });

    await issueEmailVerification(user.id, user.email);
    logEvent("auth.signup_succeeded", {
      result: "success",
      actorId: user.id,
    });

    return {
      status: "success",
      message:
        "Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.",
    };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseOrThrow(requestPasswordResetSchema, {
      email: formData.get("email"),
    });

    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    // Always the same response whether or not the account exists -
    // this is the classic account-enumeration vector (THREAT_MODEL.md
    // §1/§2), unlike signup above.
    if (user && user.status === "ACTIVE") {
      const rawToken = generateRawToken();
      await prisma.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          purpose: "PASSWORD_RESET",
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      const { subject, html } = passwordResetTemplate(
        appUrl(`/reinitialiser-mot-de-passe?token=${rawToken}`),
      );
      await sendEmail({ to: user.email, subject, html });
      logEvent("auth.password_reset_requested", {
        result: "success",
        actorId: user.id,
      });
    }

    return {
      status: "success",
      message:
        "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.",
    };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function resetPasswordAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseOrThrow(resetPasswordSchema, {
      token: formData.get("token"),
      password: formData.get("password"),
    });

    const tokenHash = hashToken(input.token);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    const isValid =
      record &&
      record.purpose === "PASSWORD_RESET" &&
      !record.consumedAt &&
      record.expiresAt > new Date();

    if (!isValid) {
      return {
        status: "error",
        message: "Ce lien est invalide ou a expiré.",
      };
    }

    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    // A password reset must invalidate any session an attacker may
    // already hold on this account (brief §110).
    await revokeAllSessionsForUser(record.userId);

    logEvent("auth.password_reset_completed", {
      result: "success",
      actorId: record.userId,
    });

    return {
      status: "success",
      message: "Mot de passe mis à jour. Vous pouvez vous connecter.",
    };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function verifyEmailAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseOrThrow(verifyEmailSchema, {
      token: formData.get("token"),
    });

    const tokenHash = hashToken(input.token);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    const isValid =
      record &&
      record.purpose === "EMAIL_VERIFICATION" &&
      !record.consumedAt &&
      record.expiresAt > new Date();

    if (!isValid) {
      return {
        status: "error",
        message: "Ce lien est invalide ou a expiré.",
      };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    logEvent("auth.email_verified", {
      result: "success",
      actorId: record.userId,
    });

    return { status: "success", message: "Adresse email confirmée." };
  } catch (error) {
    return { status: "error", message: toClientMessage(error) };
  }
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return { status: "success" };
  } catch {
    // next-auth throws a generic AuthError on any authorize() failure;
    // we deliberately don't distinguish reasons client-side (brief §46).
    return { status: "error", message: "Email ou mot de passe incorrect." };
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
}
