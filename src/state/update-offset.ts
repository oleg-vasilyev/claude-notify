import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { numberIn } from "#domain/written-number.ts";
import { stateHome, updateOffsetFile } from "#state/file-locations.ts";


export const readUpdateOffset = (): number | null => {
  if (!existsSync(updateOffsetFile())) {
    return null;
  }

  return numberIn(readFileSync(updateOffsetFile(), "utf8").trim());
};

export const writeUpdateOffset = (offset: number): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(updateOffsetFile(), `${offset}`, "utf8");
};
