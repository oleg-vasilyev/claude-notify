import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { numberIn } from "#domain/written-number.ts";
import { stateHome, watcherLockFile } from "#state/file-locations.ts";


export const claimWatcherLock = (processId: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(watcherLockFile(), `${processId}`, "utf8");
};

export const releaseWatcherLock = (): void => {
  rmSync(watcherLockFile(), { force: true });
};

export const lockedWatcherProcessId = (): number | null => {
  try {
    return numberIn(readFileSync(watcherLockFile(), "utf8").trim());
  } catch {
    return null;
  }
};
