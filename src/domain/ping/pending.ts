import { projectKeyOf } from "#domain/project.ts";


const MILLISECONDS_PER_MINUTE = 60_000;

export type PendingPing = {
  queuedAt: number;
  message: string;
  sessionId: string | null;
};

export type PendingFacts = {
  now: number;
  staleMinutes: number;
  sessionsThatMustWait: ReadonlySet<string>;
};

export type PendingSelection = {
  deliver: string[];
  dropped: PendingPing[];
  held: PendingPing[];
};

export const sessionsIn = (pending: readonly PendingPing[]): string[] => [
  ...new Set(pending.flatMap((ping) => (ping.sessionId === null ? [] : [ping.sessionId]))),
];

const wentStale = (ping: PendingPing, facts: PendingFacts): boolean =>
  facts.now - ping.queuedAt > facts.staleMinutes * MILLISECONDS_PER_MINUTE;

const mustWait = (ping: PendingPing, facts: PendingFacts): boolean =>
  ping.sessionId !== null && facts.sessionsThatMustWait.has(ping.sessionId);

export const selectPending = (
  pending: readonly PendingPing[],
  facts: PendingFacts
): PendingSelection => {
  const dropped: PendingPing[] = [];
  const held: PendingPing[] = [];
  const richestPerProject = new Map<string, string>();

  for (const ping of pending) {
    if (wentStale(ping, facts)) {
      dropped.push(ping);
      continue;
    }

    if (mustWait(ping, facts)) {
      held.push(ping);
      continue;
    }

    const project = projectKeyOf(ping.message);
    const richest = richestPerProject.get(project);

    if (richest === undefined || richest.length < ping.message.length) {
      richestPerProject.set(project, ping.message);
    }
  }

  return { deliver: [...richestPerProject.values()], dropped, held };
};
