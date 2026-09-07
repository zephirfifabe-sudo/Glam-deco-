import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseFormDataOrThrow, parseOrThrow } from "@/lib/validation/parse";
import { ValidationFailedError } from "@/lib/errors";

const schema = z.object({
  email: z.string().email(),
  age: z.coerce.number().min(18),
});

describe("parseOrThrow (brief §27/§91: server is the only trusted validator)", () => {
  it("returns the parsed value on valid input", () => {
    const result = parseOrThrow(schema, { email: "a@b.com", age: "21" });
    expect(result).toEqual({ email: "a@b.com", age: 21 });
  });

  it("throws a ValidationFailedError (not a raw ZodError) on invalid input", () => {
    expect(() =>
      parseOrThrow(schema, { email: "not-an-email", age: "21" }),
    ).toThrow(ValidationFailedError);
  });

  it("parses FormData the same way", () => {
    const fd = new FormData();
    fd.set("email", "a@b.com");
    fd.set("age", "30");
    expect(parseFormDataOrThrow(schema, fd)).toEqual({
      email: "a@b.com",
      age: 30,
    });
  });
});
