import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { SentPing } from "#domain/ping/pending.ts";
import { numberIn } from "#domain/written-number.ts";
import { lastSentFile, stateHome } from "#state/file-locations.ts";


const THE_STAMP = 0;
const AFTER_THE_STAMP = 1;
const NOTHING_RECORDED = "";

export const readLastSent = (project: string): SentPing | null => {
  let lines: string[];

  try {
    lines = readFileSync(lastSentFile(project), "utf8").split("\n");
  } catch {
    return null;
  }

  const at = numberIn((lines[THE_STAMP] ?? NOTHING_RECORDED).trim());

  return at === null ? null : { at, message: lines.slice(AFTER_THE_STAMP).join("\n") };
};

export const writeLastSent = (project: string, sent: SentPing): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(lastSentFile(project), `${sent.at}\n${sent.message}`, "utf8");
};
