import { setTimeout as sleep } from "node:timers/promises";

import { selectPending } from "#domain/pending.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { readAskedQuestions } from "#state/asked-question.ts";
import { readConfig } from "#state/config.ts";
import { log } from "#state/log.ts";
import { clearPending, readPending } from "#state/pending-queue.ts";
import { claimWatcherLock, releaseWatcherLock } from "#state/watcher-lock.ts";
import { collectAnswers } from "#app/answering.ts";
import { deliver } from "#app/deliver.ts";
import { watcherIsRunning } from "#app/watcher-process.ts";


const POLL_EVERY_MS = 30_000;
const LONG_POLL_SECONDS = 25;
const AFTER_A_FAILURE_MS = 5_000;
const GIVE_UP_AFTER_MS = 8 * 60 * 60 * 1000;
const SECONDS_PER_MINUTE = 60;
const NO_RATE_LIMIT = 0;
const NOTHING = 0;

if (watcherIsRunning()) {
  process.exit(0);
}

const config = readConfig();

if (config === null) {
  process.exit(0);
}

const telegram = config.delivery.kind === "telegram" ? config.delivery : null;

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
    const asked = telegram === null ? NOTHING : readAskedQuestions().length;
    const queued = readPending().length > NOTHING;

    if (asked === NOTHING && !queued) {
      break;
    }

    if (queued && idleSeconds() >= config.minIdleMinutes * SECONDS_PER_MINUTE) {
      await flush();
    }

    if (telegram !== null && asked > NOTHING) {
      const outcome = await collectAnswers(telegram, LONG_POLL_SECONDS);

      await sleep(outcome === "failed" ? AFTER_A_FAILURE_MS : NOTHING);
      continue;
    }

    await sleep(POLL_EVERY_MS);
  }
} finally {
  releaseWatcherLock();
  log(`WATCHER exit (pid ${process.pid})`);
}
