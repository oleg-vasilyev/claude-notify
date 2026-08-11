import { describe, expect, it } from "vitest";

import { decideDelivery, type DeliveryFacts } from "#domain/ping/delivery.ts";


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
