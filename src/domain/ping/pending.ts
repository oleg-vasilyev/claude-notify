import { projectKeyOf } from "#domain/project.ts";


const MILLISECONDS_PER_MINUTE = 60_000;
const TRANSCRIPT_SETTLES_WITHIN_MS = 5_000;

export const DROP = { stale: "stale", movedOn: "moved-on" } as const;

export type PendingPing = {
  queuedAt: number;
  message: string;
  transcriptPath: string | null;
};

export type DroppedPing =
  | { kind: typeof DROP.stale; ping: PendingPing }
  | { kind: typeof DROP.movedOn; ping: PendingPing };

export type PendingFacts = {
  now: number;
  staleMinutes: number;
  transcriptModifiedAt: ReadonlyMap<string, number>;
};

export type PendingSelection = {
  deliver: string[];
  dropped: DroppedPing[];
};

export const transcriptPathsIn = (pending: readonly PendingPing[]): string[] => [
  ...new Set(pending.flatMap((ping) => (ping.transcriptPath === null ? [] : [ping.transcriptPath]))),
];

const sessionMovedOn = (ping: PendingPing, facts: PendingFacts): boolean => {
  if (ping.transcriptPath === null) {
    return false;
  }

  const modifiedAt = facts.transcriptModifiedAt.get(ping.transcriptPath);

  return modifiedAt !== undefined && modifiedAt > ping.queuedAt + TRANSCRIPT_SETTLES_WITHIN_MS;
};

const droppedFor = (ping: PendingPing, facts: PendingFacts): DroppedPing | null => {
  if (facts.now - ping.queuedAt > facts.staleMinutes * MILLISECONDS_PER_MINUTE) {
    return { kind: DROP.stale, ping };
  }

  if (sessionMovedOn(ping, facts)) {
    return { kind: DROP.movedOn, ping };
  }

  return null;
};

export const selectPending = (
  pending: readonly PendingPing[],
  facts: PendingFacts
): PendingSelection => {
  const dropped: DroppedPing[] = [];
  const richestPerProject = new Map<string, string>();

  for (const ping of pending) {
    const gone = droppedFor(ping, facts);

    if (gone !== null) {
      dropped.push(gone);
      continue;
    }

    const project = projectKeyOf(ping.message);
    const richest = richestPerProject.get(project);

    if (richest === undefined || richest.length < ping.message.length) {
      richestPerProject.set(project, ping.message);
    }
  }

  return { deliver: [...richestPerProject.values()], dropped };
};
