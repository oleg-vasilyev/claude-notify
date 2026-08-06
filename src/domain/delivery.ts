const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = 60_000;

export type DeliveryFacts = {
  idleSeconds: number;
  minIdleMinutes: number;
  rateLimitMinutes: number;
  lastSentAt: number | null;
  now: number;
};

export type DeliveryVerdict =
  | { kind: "send" }
  | { kind: "queue"; idleSeconds: number }
  | { kind: "skip"; sinceLastSentMinutes: number };

export const decideDelivery = (facts: DeliveryFacts): DeliveryVerdict => {
  const userIsPresent =
    facts.minIdleMinutes > 0 && facts.idleSeconds < facts.minIdleMinutes * SECONDS_PER_MINUTE;

  if (userIsPresent) {
    return { kind: "queue", idleSeconds: facts.idleSeconds };
  }

  if (facts.rateLimitMinutes > 0 && facts.lastSentAt !== null) {
    const sinceLastSent = facts.now - facts.lastSentAt;

    if (sinceLastSent < facts.rateLimitMinutes * MILLISECONDS_PER_MINUTE) {
      return { kind: "skip", sinceLastSentMinutes: sinceLastSent / MILLISECONDS_PER_MINUTE };
    }
  }

  return { kind: "send" };
};
