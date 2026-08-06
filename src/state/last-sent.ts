import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { lastSentFile, stateHome } from "#state/file-locations.ts";


const DECIMAL = 10;

export const readLastSentAt = (project: string): number | null => {
  try {
    const stamp = Number.parseInt(readFileSync(lastSentFile(project), "utf8").trim(), DECIMAL);

    return Number.isNaN(stamp) ? null : stamp;
  } catch {
    return null;
  }
};

export const writeLastSentAt = (project: string, at: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(lastSentFile(project), `${at}`, "utf8");
};
