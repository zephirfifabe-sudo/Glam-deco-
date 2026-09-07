import { z } from "zod";

// Length over composition rules, per current OWASP guidance - no
// forced "1 uppercase + 1 digit + 1 symbol" theatre that just pushes
// users toward predictable substitutions.
const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(128, "Le mot de passe est trop long.");

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(120),
  email: z.string().trim().toLowerCase().email("Email invalide."),
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide."),
});
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Jeton manquant."),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Jeton manquant."),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
