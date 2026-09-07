import pino from "pino";

// Structured JSON logs only - never `console.log(user)` (ARCHITECTURE.md
// §7). Every log call should include an `event` name and relevant IDs,
// never passwords, tokens, secrets, or full payment data.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "*.password",
      "*.passwordHash",
      "*.token",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

interface LogEventFields {
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  result?: "success" | "failure";
  [key: string]: unknown;
}

/**
 * Structured event log helper matching the shape documented in
 * ARCHITECTURE.md §7 / SECURITY.md §5: { event, actorId, resourceType,
 * resourceId, result, ...metadata }.
 */
export function logEvent(event: string, fields: LogEventFields = {}) {
  logger.info({ event, ...fields });
}
