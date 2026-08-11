import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { numberIn } from "#domain/written-number.ts";
import { lastSentFile, stateHome } from "#state/file-locations.ts";


export const readLastSentAt = (project: string): number | null => {
  try {
    return numberIn(readFileSync(lastSentFile(project), "utf8").trim());
  } catch {
    return null;
  }
};

export const writeLastSentAt = (project: string, at: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(lastSentFile(project), `${at}`, "utf8");
};
