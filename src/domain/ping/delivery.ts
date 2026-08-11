const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = 60_000;

export type DeliveryFacts = {
  idleSeconds: number;
  minIdleMinutes: number;
  rateLimitMinutes: number;
  lastSentAt: number | null;
  now: number;
};

export const DELIVERY_VERDICT = {
  send: "send",
  queue: "queue",
  skip: "skip",
} as const;

export type DeliveryVerdict =
  | { kind: typeof DELIVERY_VERDICT.send }
  | { kind: typeof DELIVERY_VERDICT.queue; idleSeconds: number }
  | { kind: typeof DELIVERY_VERDICT.skip; sinceLastSentMinutes: number };

export const decideDelivery = (facts: DeliveryFacts): DeliveryVerdict => {
  const userIsPresent =
    facts.minIdleMinutes > 0 && facts.idleSeconds < facts.minIdleMinutes * SECONDS_PER_MINUTE;

  if (userIsPresent) {
    return { kind: DELIVERY_VERDICT.queue, idleSeconds: facts.idleSeconds };
  }

  if (facts.rateLimitMinutes > 0 && facts.lastSentAt !== null) {
    const sinceLastSent = facts.now - facts.lastSentAt;

    if (sinceLastSent < facts.rateLimitMinutes * MILLISECONDS_PER_MINUTE) {
      return {
        kind: DELIVERY_VERDICT.skip,
        sinceLastSentMinutes: sinceLastSent / MILLISECONDS_PER_MINUTE,
      };
    }
  }

  return { kind: DELIVERY_VERDICT.send };
};
