import { projectKeyOf } from "#domain/project.ts";


const MILLISECONDS_PER_MINUTE = 60_000;

export type PendingPing = {
  queuedAt: number;
  message: string;
  sessionId: string | null;
};

export const DROP = { stale: "stale", seen: "seen", repeat: "repeat" } as const;

export type DroppedPing =
  | { kind: typeof DROP.stale; ping: PendingPing }
  | { kind: typeof DROP.seen; ping: PendingPing }
  | { kind: typeof DROP.repeat; ping: PendingPing };

export type SentPing = { at: number; message: string };

export type PendingFacts = {
  now: number;
  staleMinutes: number;
  lastInputAt: number;
  sessionsThatMustWait: ReadonlySet<string>;
  sentPerProject: ReadonlyMap<string, SentPing>;
};

export type PendingSelection = {
  deliver: string[];
  dropped: DroppedPing[];
  held: PendingPing[];
};

export const sessionsIn = (pending: readonly PendingPing[]): string[] => [
  ...new Set(pending.flatMap((ping) => (ping.sessionId === null ? [] : [ping.sessionId]))),
];

export const projectsIn = (pending: readonly PendingPing[]): string[] => [
  ...new Set(pending.map((ping) => projectKeyOf(ping.message))),
];

const wentStale = (ping: PendingPing, facts: PendingFacts): boolean =>
  facts.now - ping.queuedAt > facts.staleMinutes * MILLISECONDS_PER_MINUTE;

const wasSeen = (ping: PendingPing, facts: PendingFacts): boolean =>
  facts.lastInputAt > ping.queuedAt;

const wasSaidAlready = (project: string, ping: PendingPing, facts: PendingFacts): boolean => {
  const sent = facts.sentPerProject.get(project);

  return (
    sent !== undefined &&
    sent.message === ping.message &&
    sent.at > ping.queuedAt &&
    sent.at <= facts.now
  );
};

const mustWait = (ping: PendingPing, facts: PendingFacts): boolean =>
  ping.sessionId !== null && facts.sessionsThatMustWait.has(ping.sessionId);

export const selectPending = (
  pending: readonly PendingPing[],
  facts: PendingFacts
): PendingSelection => {
  const dropped: DroppedPing[] = [];
  const held: PendingPing[] = [];
  const richestPerProject = new Map<string, string>();

  for (const ping of pending) {
    const project = projectKeyOf(ping.message);

    if (wentStale(ping, facts)) {
      dropped.push({ kind: DROP.stale, ping });
      continue;
    }

    if (wasSeen(ping, facts)) {
      dropped.push({ kind: DROP.seen, ping });
      continue;
    }

    if (wasSaidAlready(project, ping, facts)) {
      dropped.push({ kind: DROP.repeat, ping });
      continue;
    }

    if (mustWait(ping, facts)) {
      held.push(ping);
      continue;
    }

    const richest = richestPerProject.get(project);

    if (richest === undefined || richest.length < ping.message.length) {
      richestPerProject.set(project, ping.message);
    }
  }

  return { deliver: [...richestPerProject.values()], dropped, held };
};
