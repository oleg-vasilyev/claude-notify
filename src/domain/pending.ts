import { projectKeyOf } from "#domain/project.ts";


const MILLISECONDS_PER_MINUTE = 60_000;

export type PendingPing = {
  queuedAt: number;
  message: string;
};

export type PendingSelection = {
  deliver: string[];
  dropped: PendingPing[];
};

export const selectPending = (
  pending: readonly PendingPing[],
  facts: { now: number; staleMinutes: number }
): PendingSelection => {
  const dropped: PendingPing[] = [];
  const richestPerProject = new Map<string, string>();

  for (const ping of pending) {
    if (facts.now - ping.queuedAt > facts.staleMinutes * MILLISECONDS_PER_MINUTE) {
      dropped.push(ping);
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
