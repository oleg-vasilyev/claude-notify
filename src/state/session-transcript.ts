import { statSync } from "node:fs";


export const modifiedTimesOf = (paths: readonly string[]): Map<string, number> => {
  const times = new Map<string, number>();

  for (const path of paths) {
    try {
      times.set(path, statSync(path).mtimeMs);
    } catch {
      continue;
    }
  }

  return times;
};
