import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";

import type { PendingPing } from "#domain/pending.ts";
import { pendingFile, stateHome } from "#state/file-locations.ts";


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
