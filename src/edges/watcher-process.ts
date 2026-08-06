import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { lockedWatcherProcessId } from "#edges/store.ts";


const watcherEntryPoint = (): string =>
  fileURLToPath(new URL("../watcher.ts", import.meta.url));

const isAlive = (processId: number): boolean => {
  try {
    process.kill(processId, 0);

    return true;
  } catch {
    return false;
  }
};

export const watcherIsRunning = (): boolean => {
  const locked = lockedWatcherProcessId();

  return locked !== null && isAlive(locked);
};

export const startWatcher = (): void => {
  const watcher = spawn(process.execPath, [watcherEntryPoint()], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  watcher.unref();
};
