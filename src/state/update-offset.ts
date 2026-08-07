import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { stateHome, updateOffsetFile } from "#state/file-locations.ts";


const DECIMAL = 10;

export const readUpdateOffset = (): number | null => {
  if (!existsSync(updateOffsetFile())) {
    return null;
  }

  const stored = Number.parseInt(readFileSync(updateOffsetFile(), "utf8").trim(), DECIMAL);

  return Number.isNaN(stored) ? null : stored;
};

export const writeUpdateOffset = (offset: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(updateOffsetFile(), `${offset}`, "utf8");
};
