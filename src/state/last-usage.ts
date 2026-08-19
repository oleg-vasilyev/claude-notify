import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { RememberedUsage, UsageSnapshot } from "#domain/ping/usage.ts";
import { lastUsageFile, stateHome } from "#state/file-locations.ts";
import { log } from "#state/log.ts";


export const rememberUsage = (snapshot: UsageSnapshot, readAt: number): void => {
  try {
    mkdirSync(stateHome(), { recursive: true });
    writeFileSync(lastUsageFile(), JSON.stringify({ snapshot, readAt }), "utf8");
  } catch (failure) {
    log(`WARN could not keep the limits reading: ${String(failure)}`);
  }
};

export const rememberedUsage = (): RememberedUsage | null => {
  if (!existsSync(lastUsageFile())) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(lastUsageFile(), "utf8")) as Partial<RememberedUsage>;

    return typeof parsed.readAt === "number" && Number.isFinite(parsed.readAt) && parsed.snapshot !== null && parsed.snapshot !== undefined
      ? { snapshot: parsed.snapshot, readAt: parsed.readAt }
      : null;
  } catch {
    return null;
  }
};
