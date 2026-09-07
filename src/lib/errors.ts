// Typed domain errors (ARCHITECTURE.md §7 / brief §90). Caught at the
// Server Action / Route Handler boundary and mapped to safe, generic
// messages for the client - raw error messages/stack traces never reach
// the browser. Add new concrete errors here as each module needs them;
// do not throw plain `Error` for expected business-rule failures.
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";

  constructor(message = "Authentication required.") {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";

  constructor(message = "You are not allowed to perform this action.") {
    super(message);
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = "VALIDATION_FAILED";

  constructor(message = "The submitted data is invalid.") {
    super(message);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Maps any thrown error to a message safe to send to the client: domain
 * errors surface their own message (they are written to be user-facing),
 * anything else becomes a generic message so internals/stack traces
 * never leak (brief §90).
 */
export function toClientMessage(error: unknown): string {
  if (isDomainError(error)) {
    return error.message;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}
