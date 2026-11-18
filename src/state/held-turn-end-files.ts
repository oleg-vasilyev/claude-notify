import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HeldTurnEnd } from "#domain/ping/held-turn-end.ts";
import { HELD_TURN_END_PREFIX, heldTurnEndFile, stateHome } from "#state/file-locations.ts";


const heldFrom = (text: string): HeldTurnEnd | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const held = parsed as Partial<HeldTurnEnd>;
  const ping = held.ping as Partial<HeldTurnEnd["ping"]> | null | undefined;

  if (
    typeof held.sessionId !== "string" ||
    typeof held.heldAt !== "number" ||
    typeof ping !== "object" ||
    ping === null ||
    typeof ping.message !== "string" ||
    typeof ping.rateLimitMinutes !== "number"
  ) {
    return null;
  }

  return {
    sessionId: held.sessionId,
    heldAt: held.heldAt,
    transcriptPath: typeof held.transcriptPath === "string" ? held.transcriptPath : null,
    ping: { message: ping.message, rateLimitMinutes: ping.rateLimitMinutes },
  };
};

export const holdTurnEnd = (held: HeldTurnEnd): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(heldTurnEndFile(held.sessionId), JSON.stringify(held), "utf8");
};

export const readHeldTurnEnds = (): HeldTurnEnd[] => {
  if (!existsSync(stateHome())) {
    return [];
  }

  const held: HeldTurnEnd[] = [];

  for (const name of readdirSync(stateHome())) {
    if (!name.startsWith(HELD_TURN_END_PREFIX)) {
      continue;
    }

    const path = join(stateHome(), name);

    try {
      const one = heldFrom(readFileSync(path, "utf8"));

      if (one === null) {
        rmSync(path, { force: true });
      } else {
        held.push(one);
      }
    } catch {
      continue;
    }
  }

  return held;
};

export const forgetHeldTurnEnd = (held: HeldTurnEnd): void => {
  const path = heldTurnEndFile(held.sessionId);

  try {
    if (heldFrom(readFileSync(path, "utf8"))?.heldAt !== held.heldAt) {
      return;
    }
  } catch {
    return;
  }

  rmSync(path, { force: true });
};
