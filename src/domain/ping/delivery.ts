const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = 60_000;
const NOT_YET_SENT = 0;
const REFUSED_WITH = /refused with (\d{3})/;
const STATUS = 1;
const RATE_LIMITED = 429;
const THEIR_END_BROKE = 500;

export const refusedWith = (what: string, status: number, detail: string): string =>
  detail === "" ? `${what} refused with ${status}` : `${what} refused with ${status}: ${detail}`;

export const statusIn = (failure: string): number | null => {
  const refusal = REFUSED_WITH.exec(failure)?.[STATUS];

  return refusal === undefined ? null : Number(refusal);
};

export const worthAnotherTry = (failure: string): boolean => {
  const status = statusIn(failure);

  return status === null || status === RATE_LIMITED || status >= THEIR_END_BROKE;
};

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

const minutesSinceLastSent = (facts: DeliveryFacts): number | null =>
  facts.lastSentAt === null ? null : (facts.now - facts.lastSentAt) / MILLISECONDS_PER_MINUTE;

export const decideDelivery = (facts: DeliveryFacts): DeliveryVerdict => {
  const userIsPresent =
    facts.minIdleMinutes > 0 && facts.idleSeconds < facts.minIdleMinutes * SECONDS_PER_MINUTE;

  if (userIsPresent) {
    return { kind: DELIVERY_VERDICT.queue, idleSeconds: facts.idleSeconds };
  }

  const sinceLastSentMinutes = minutesSinceLastSent(facts);
  const insideTheWindow =
    sinceLastSentMinutes !== null &&
    sinceLastSentMinutes >= NOT_YET_SENT &&
    sinceLastSentMinutes < facts.rateLimitMinutes;

  if (insideTheWindow) {
    return { kind: DELIVERY_VERDICT.skip, sinceLastSentMinutes };
  }

  return { kind: DELIVERY_VERDICT.send };
};
