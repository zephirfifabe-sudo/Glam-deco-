import { z } from "zod";
import { ValidationFailedError } from "@/lib/errors";

/**
 * Convention for validating input at the server boundary (Server
 * Actions, Route Handlers). A Zod schema is the single source of truth
 * for a feature's input shape - the same schema can be reused
 * client-side for fast form feedback, but the server-side call below is
 * the one that is ever trusted (brief §27/§91).
 *
 * Throws ValidationFailedError (a DomainError, see lib/errors.ts) with a
 * human-readable message on failure, rather than leaking Zod's internal
 * error shape to the client.
 */
export function parseOrThrow<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") || "input"}: ${firstIssue.message}`
      : "Invalid input.";
    throw new ValidationFailedError(message);
  }
  return result.data;
}

/** Same as parseOrThrow but reads from a FormData instance. */
export function parseFormDataOrThrow<Schema extends z.ZodTypeAny>(
  schema: Schema,
  formData: FormData,
): z.infer<Schema> {
  return parseOrThrow(schema, Object.fromEntries(formData.entries()));
}
