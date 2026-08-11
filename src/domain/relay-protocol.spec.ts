import { describe, expect, it } from "vitest";

import {
  authorizationFor,
  PING_PATH,
  relayEndpoint,
  relayRequestFrom,
} from "#domain/relay-protocol.ts";


const SECRET = "s3cr3t";
const HEADER = `Bearer ${SECRET}`;

const bodyWith = (message: unknown): string => JSON.stringify({ message });

describe("relayEndpoint", () => {
  it("joins the base and the path", () => {
    expect(relayEndpoint("http://home:8787", PING_PATH)).toBe("http://home:8787/ping");
  });

  it("survives a base the user typed with a trailing slash", () => {
    expect(relayEndpoint("http://home:8787/", PING_PATH)).toBe("http://home:8787/ping");
  });

  it("survives several trailing slashes", () => {
    expect(relayEndpoint("http://home:8787///", PING_PATH)).toBe("http://home:8787/ping");
  });
});

describe("authorizationFor", () => {
  it("carries the secret as a bearer token", () => {
    expect(authorizationFor(SECRET)).toBe(HEADER);
  });
});

describe("relayRequestFrom", () => {
  it("accepts a message from a caller carrying the secret", () => {
    expect(relayRequestFrom(SECRET, HEADER, bodyWith("[a-project@work] закончил ход"))).toEqual({
      kind: "ping",
      message: "[a-project@work] закончил ход",
    });
  });

  it("refuses a caller with the wrong secret", () => {
    expect(relayRequestFrom(SECRET, "Bearer nope", bodyWith("hi"))).toEqual({
      kind: "unauthorised",
    });
  });

  it("refuses a caller with no authorization at all", () => {
    expect(relayRequestFrom(SECRET, undefined, bodyWith("hi"))).toEqual({ kind: "unauthorised" });
  });

  it("refuses the bare secret sent without the bearer prefix", () => {
    expect(relayRequestFrom(SECRET, SECRET, bodyWith("hi"))).toEqual({ kind: "unauthorised" });
  });

  it("refuses everyone when the host itself has no secret configured", () => {
    expect(relayRequestFrom("", "Bearer ", bodyWith("hi"))).toEqual({ kind: "unauthorised" });
  });

  it("refuses a body that is not JSON", () => {
    expect(relayRequestFrom(SECRET, HEADER, "not json at all")).toEqual({ kind: "malformed" });
  });

  it("refuses a body that is JSON but not an object", () => {
    expect(relayRequestFrom(SECRET, HEADER, "null")).toEqual({ kind: "malformed" });
  });

  it("refuses an object carrying no message", () => {
    expect(relayRequestFrom(SECRET, HEADER, JSON.stringify({ text: "hi" }))).toEqual({
      kind: "malformed",
    });
  });

  it("refuses a message that is not a string", () => {
    expect(relayRequestFrom(SECRET, HEADER, bodyWith({ nested: true }))).toEqual({
      kind: "malformed",
    });
  });

  it("refuses a message of nothing but whitespace, which would ping an empty line", () => {
    expect(relayRequestFrom(SECRET, HEADER, bodyWith("   \n  "))).toEqual({ kind: "malformed" });
  });

  it("checks the secret before it looks at the body, so a stranger learns nothing", () => {
    expect(relayRequestFrom(SECRET, "Bearer nope", "not json at all")).toEqual({
      kind: "unauthorised",
    });
  });
});
