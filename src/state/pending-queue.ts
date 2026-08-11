import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";

import type { PendingPing } from "#domain/ping/pending.ts";
import { pendingFile, stateHome } from "#state/file-locations.ts";


const pendingFrom = (line: string): PendingPing | null => {
  let parsed: Partial<PendingPing>;

  try {
    parsed = JSON.parse(line) as Partial<PendingPing>;
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") {
    return null;
  }

  if (typeof parsed.queuedAt !== "number" || typeof parsed.message !== "string") {
    return null;
  }

  return {
    queuedAt: parsed.queuedAt,
    message: parsed.message,
    transcriptPath: typeof parsed.transcriptPath === "string" ? parsed.transcriptPath : null,
  };
};

export const readPending = (): PendingPing[] => {
  if (!existsSync(pendingFile())) {
    return [];
  }

  const pending: PendingPing[] = [];

  for (const line of readFileSync(pendingFile(), "utf8").split("\n")) {
    const ping = pendingFrom(line);

    if (ping !== null) {
      pending.push(ping);
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
