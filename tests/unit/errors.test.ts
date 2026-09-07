import { describe, expect, it } from "vitest";
import {
  UnauthenticatedError,
  UnauthorizedError,
  ValidationFailedError,
  isDomainError,
  toClientMessage,
} from "@/lib/errors";

describe("domain errors (brief §90: no stack traces to the client)", () => {
  it("recognizes concrete domain errors", () => {
    expect(isDomainError(new UnauthorizedError())).toBe(true);
    expect(isDomainError(new Error("plain"))).toBe(false);
  });

  it("surfaces a domain error's own message to the client", () => {
    expect(toClientMessage(new ValidationFailedError("email: invalide"))).toBe(
      "email: invalide",
    );
    expect(toClientMessage(new UnauthenticatedError())).toBe(
      "Authentication required.",
    );
  });

  it("never leaks a non-domain error's internals to the client", () => {
    const internal = new Error("connection string: postgres://secret@host");
    expect(toClientMessage(internal)).toBe(
      "Une erreur est survenue. Veuillez réessayer.",
    );
  });
});
