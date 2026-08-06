import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { stateHome, watcherLockFile } from "#state/file-locations.ts";


const DECIMAL = 10;

export const claimWatcherLock = (processId: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(watcherLockFile(), `${processId}`, "utf8");
};

export const releaseWatcherLock = (): void => {
  rmSync(watcherLockFile(), { force: true });
};

export const lockedWatcherProcessId = (): number | null => {
  try {
    const processId = Number.parseInt(readFileSync(watcherLockFile(), "utf8").trim(), DECIMAL);

    return Number.isNaN(processId) ? null : processId;
  } catch {
    return null;
  }
};
