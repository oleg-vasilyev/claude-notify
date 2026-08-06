import { setTimeout as sleep } from "node:timers/promises";

import { selectPending } from "#domain/pending.ts";
import { readConfig } from "#edges/config.ts";
import { deliver } from "#edges/deliver.ts";
import { log } from "#edges/log.ts";
import { idleSeconds } from "#edges/presence.ts";
import { claimWatcherLock, clearPending, readPending, releaseWatcherLock } from "#edges/store.ts";
import { watcherIsRunning } from "#edges/watcher-process.ts";


const POLL_EVERY_MS = 30_000;
const GIVE_UP_AFTER_MS = 8 * 60 * 60 * 1000;
const SECONDS_PER_MINUTE = 60;
const NO_RATE_LIMIT = 0;

if (watcherIsRunning()) {
  process.exit(0);
}

const config = readConfig();

if (config === null) {
  process.exit(0);
}

claimWatcherLock(process.pid);
log(`WATCHER started (pid ${process.pid})`);

const flush = async (): Promise<void> => {
  const pending = readPending();

  clearPending();

  const selection = selectPending(pending, {
    now: Date.now(),
    staleMinutes: config.staleMinutes,
  });

  for (const dropped of selection.dropped) {
    log(`DROP stale (queued ${new Date(dropped.queuedAt).toISOString()}) | ${dropped.message}`);
  }

  for (const message of selection.deliver) {
    await deliver({ message, rateLimitMinutes: NO_RATE_LIMIT, ignorePresence: true });
  }
};

try {
  const deadline = Date.now() + GIVE_UP_AFTER_MS;

  while (Date.now() < deadline) {
    if (readPending().length === 0) {
      break;
    }

    if (idleSeconds() >= config.minIdleMinutes * SECONDS_PER_MINUTE) {
      await flush();
      break;
    }

    await sleep(POLL_EVERY_MS);
  }
} finally {
  releaseWatcherLock();
  log(`WATCHER exit (pid ${process.pid})`);
}
