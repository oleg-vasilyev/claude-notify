import { describe, expect, it } from "vitest";

import {
  decideDelivery,
  refusedWith,
  worthAnotherTry,
  type DeliveryFacts,
} from "#domain/ping/delivery.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const MINUTE = 60_000;

const facts = (overrides: Partial<DeliveryFacts>): DeliveryFacts => ({
  idleSeconds: 600,
  minIdleMinutes: 3,
  rateLimitMinutes: 0,
  lastSentAt: null,
  now: NOW,
  ...overrides,
});

describe("decideDelivery", () => {
  it("queues while the user is at the keyboard", () => {
    expect(decideDelivery(facts({ idleSeconds: 10 }))).toEqual({ kind: "queue", idleSeconds: 10 });
  });

  it("sends once they have been idle long enough", () => {
    expect(decideDelivery(facts({ idleSeconds: 200 }))).toEqual({ kind: "send" });
  });

  it("treats the threshold itself as away", () => {
    expect(decideDelivery(facts({ idleSeconds: 180 }))).toEqual({ kind: "send" });
  });

  it("never queues when the presence check is switched off", () => {
    expect(decideDelivery(facts({ idleSeconds: 0, minIdleMinutes: 0 }))).toEqual({ kind: "send" });
  });

  it("skips inside the rate-limit window", () => {
    const verdict = decideDelivery(
      facts({ rateLimitMinutes: 10, lastSentAt: NOW - 5 * MINUTE })
    );

    expect(verdict).toEqual({ kind: "skip", sinceLastSentMinutes: 5 });
  });

  it("sends again once the window has passed", () => {
    expect(
      decideDelivery(facts({ rateLimitMinutes: 10, lastSentAt: NOW - 11 * MINUTE }))
    ).toEqual({ kind: "send" });
  });

  it("sends exactly at the edge of the window", () => {
    expect(
      decideDelivery(facts({ rateLimitMinutes: 10, lastSentAt: NOW - 10 * MINUTE }))
    ).toEqual({ kind: "send" });
  });

  it("ignores the stamp when the ping is deliberate and carries no rate limit", () => {
    expect(
      decideDelivery(facts({ rateLimitMinutes: 0, lastSentAt: NOW - 1000 }))
    ).toEqual({ kind: "send" });
  });

  it("never skips a deliberate ping, whatever the stamp says", () => {
    expect(
      decideDelivery(facts({ rateLimitMinutes: 0, lastSentAt: NOW + MINUTE }))
    ).toEqual({ kind: "send" });
  });

  it("sends against a stamp from the future, since a clock that moved must not swallow a ping", () => {
    expect(
      decideDelivery(facts({ rateLimitMinutes: 10, lastSentAt: NOW + MINUTE }))
    ).toEqual({ kind: "send" });
  });

  it("ignores a rate limit that has never sent anything", () => {
    expect(decideDelivery(facts({ rateLimitMinutes: 10, lastSentAt: null }))).toEqual({
      kind: "send",
    });
  });

  it("prefers the queue over the rate limit, because a queued ping is not lost", () => {
    expect(
      decideDelivery(
        facts({ idleSeconds: 10, rateLimitMinutes: 10, lastSentAt: NOW - MINUTE })
      )
    ).toEqual({ kind: "queue", idleSeconds: 10 });
  });

  it("counts a broken presence probe as away rather than swallowing the ping", () => {
    expect(decideDelivery(facts({ idleSeconds: Number.MAX_SAFE_INTEGER }))).toEqual({
      kind: "send",
    });
  });
});

describe("refusedWith", () => {
  it("names who refused, with what, and what they said about it", () => {
    expect(refusedWith("Telegram", 400, "bad markup")).toBe("Telegram refused with 400: bad markup");
  });

  it("leaves off a colon when there is nothing after it", () => {
    expect(refusedWith("Telegram", 400, "")).toBe("Telegram refused with 400");
  });
});

describe("worthAnotherTry", () => {
  it("tries again when nothing refused at all — the network never answered", () => {
    expect(worthAnotherTry("Error: TypeError: fetch failed")).toBe(true);
  });

  it("tries again on a timeout, which is the same kind of nothing", () => {
    expect(worthAnotherTry("Error: TimeoutError: The operation was aborted")).toBe(true);
  });

  it("tries again when their end broke, since it may be mended by the next poll", () => {
    expect(worthAnotherTry(refusedWith("Telegram", 502, "bad gateway"))).toBe(true);
  });

  it("tries again when told there were too many, which is a request to wait, not a refusal", () => {
    expect(worthAnotherTry(refusedWith("Telegram", 429, "retry after 30"))).toBe(true);
  });

  it("gives up on a wrong token, because the next attempt is wrong in the same way", () => {
    expect(worthAnotherTry(refusedWith("Telegram", 401, "unauthorized"))).toBe(false);
  });

  it("gives up on a chat that does not exist", () => {
    expect(worthAnotherTry(refusedWith("Telegram", 400, "chat not found"))).toBe(false);
  });

  it("gives up on a picture too large, whoever phrased the refusal", () => {
    expect(worthAnotherTry(refusedWith("Telegram, over the picture,", 413, "too big"))).toBe(false);
  });

  it("gives up on a relay that refused the secret", () => {
    expect(worthAnotherTry(refusedWith("the relay", 401, "wrong secret"))).toBe(false);
  });

  it("reads the status of the refusal, not a number that happens to be in the detail", () => {
    expect(worthAnotherTry(refusedWith("Telegram", 400, "expected 500 bytes"))).toBe(false);
  });
});
