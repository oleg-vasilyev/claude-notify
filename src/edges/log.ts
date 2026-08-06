import { appendFileSync, mkdirSync } from "node:fs";

import { logFile, stateHome } from "#edges/paths.ts";


const PAYLOAD_KEPT_CHARACTERS = 400;
const WHITESPACE_RUN = /\s+/g;

const TWO_DIGITS = 2;

const padded = (part: number): string => `${part}`.padStart(TWO_DIGITS, "0");

const stamp = (): string => {
  const at = new Date();
  const day = `${at.getFullYear()}-${padded(at.getMonth() + 1)}-${padded(at.getDate())}`;
  const time = `${padded(at.getHours())}:${padded(at.getMinutes())}:${padded(at.getSeconds())}`;

  return `${day} ${time}`;
};

export const log = (line: string): void => {
  try {
    mkdirSync(stateHome(), { recursive: true });
    appendFileSync(logFile(), `${stamp()} ${line}\n`, "utf8");
  } catch {
    console.error(`claude-notify: could not write the log: ${line}`);
  }
};

export const flattenPayload = (raw: string): string => {
  const flat = raw.replace(WHITESPACE_RUN, " ").trim();

  if (flat.length <= PAYLOAD_KEPT_CHARACTERS) {
    return flat;
  }

  return `${flat.slice(0, PAYLOAD_KEPT_CHARACTERS)}... (${flat.length} chars)`;
};
