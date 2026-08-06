import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import type { PendingPing } from "#domain/pending.ts";
import { lastSentFile, pendingFile, stateHome, watcherLockFile } from "#edges/paths.ts";


export const readPending = (): PendingPing[] => {
  if (!existsSync(pendingFile())) {
    return [];
  }

  const lines = readFileSync(pendingFile(), "utf8").split("\n");
  const pending: PendingPing[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    try {
      pending.push(JSON.parse(line) as PendingPing);
    } catch {
      continue;
    }
  }

  return pending;
};

export const appendPending = (ping: PendingPing): void => {
  mkdirSync(stateHome(), { recursive: true });
  appendFileSync(pendingFile(), `${JSON.stringify(ping)}\n`, "utf8");
};

export const clearPending = (): void => {
  rmSync(pendingFile(), { force: true });
};

export const readLastSentAt = (project: string): number | null => {
  try {
    const stamp = Number.parseInt(readFileSync(lastSentFile(project), "utf8").trim(), 10);

    return Number.isNaN(stamp) ? null : stamp;
  } catch {
    return null;
  }
};

export const writeLastSentAt = (project: string, at: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(lastSentFile(project), `${at}`, "utf8");
};

export const claimWatcherLock = (processId: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(watcherLockFile(), `${processId}`, "utf8");
};

export const releaseWatcherLock = (): void => {
  rmSync(watcherLockFile(), { force: true });
};

export const lockedWatcherProcessId = (): number | null => {
  try {
    const processId = Number.parseInt(readFileSync(watcherLockFile(), "utf8").trim(), 10);

    return Number.isNaN(processId) ? null : processId;
  } catch {
    return null;
  }
};
