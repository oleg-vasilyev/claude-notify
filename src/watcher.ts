import { setTimeout as sleep } from "node:timers/promises";

import { impossible } from "#domain/impossible.ts";
import { selectPending, sessionsIn, type PendingPing } from "#domain/ping/pending.ts";
import { mayGoOut, wallToCheck } from "#domain/ping/session-activity.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { readAskedQuestions } from "#state/asked-question.ts";
import { DELIVERY, readConfig } from "#state/config.ts";
import { log } from "#state/log.ts";
import { appendPending, clearPending, readPending } from "#state/pending-queue.ts";
import { readSessionNote } from "#state/session-note.ts";
import { toolHasAnswered } from "#state/session-transcript.ts";
import { claimWatcherLock, releaseWatcherLock } from "#state/watcher-lock.ts";
import { ANSWERING_OUTCOME, collectAnswers, type AnsweringOutcome } from "#app/answering.ts";
import { deliver } from "#app/deliver.ts";
import { watcherIsRunning } from "#app/watcher-process.ts";


const POLL_EVERY_MS = 30_000;
const LONG_POLL_SECONDS = 25;
const AFTER_A_FAILURE_MS = 5_000;
const GIVE_UP_AFTER_MS = 8 * 60 * 60 * 1000;
const SECONDS_PER_MINUTE = 60;
const NO_RATE_LIMIT = 0;
const IMMEDIATELY = 0;

if (watcherIsRunning()) {
  process.exit(0);
}

const config = readConfig();

if (config === null) {
  process.exit(0);
}

const telegram = config.delivery.kind === DELIVERY.telegram ? config.delivery : null;

claimWatcherLock(process.pid);
log(`WATCHER started (pid ${process.pid})`);

const pauseAfter = (outcome: AnsweringOutcome): number => {
  switch (outcome.kind) {
    case ANSWERING_OUTCOME.failed:
      return AFTER_A_FAILURE_MS;

    case ANSWERING_OUTCOME.collected:
    case ANSWERING_OUTCOME.nothingAsked:
      return IMMEDIATELY;

    default:
      return impossible(outcome);
  }
};

const sessionsThatMustWait = (pending: readonly PendingPing[]): Set<string> => {
  const waiting = new Set<string>();

  for (const sessionId of sessionsIn(pending)) {
    const note = readSessionNote(sessionId);
    const wall = note === null ? null : wallToCheck(note);
    const cameDown = wall !== null && toolHasAnswered(wall.transcriptPath, wall.toolUseId);

    if (!mayGoOut(note, cameDown)) {
      waiting.add(sessionId);
    }
  }

  return waiting;
};

const flush = async (): Promise<void> => {
  const pending = readPending();

  const selection = selectPending(pending, {
    now: Date.now(),
    staleMinutes: config.staleMinutes,
    sessionsThatMustWait: sessionsThatMustWait(pending),
  });

  clearPending();

  for (const ping of selection.held) {
    appendPending(ping);
  }

  for (const dropped of selection.dropped) {
    const queuedAt = new Date(dropped.queuedAt).toISOString();

    log(`DROP stale (queued ${queuedAt}) | ${dropped.message}`);
  }

  for (const message of selection.deliver) {
    await deliver({ message, rateLimitMinutes: NO_RATE_LIMIT, ignorePresence: true });
  }
};

try {
  const deadline = Date.now() + GIVE_UP_AFTER_MS;

  while (Date.now() < deadline) {
    const asked = telegram === null ? 0 : readAskedQuestions().length;
    const queued = readPending().length > 0;

    if (asked === 0 && !queued) {
      break;
    }

    if (queued && idleSeconds() >= config.minIdleMinutes * SECONDS_PER_MINUTE) {
      await flush();
    }

    if (telegram !== null && asked > 0) {
      await sleep(pauseAfter(await collectAnswers(telegram, LONG_POLL_SECONDS)));
      continue;
    }

    await sleep(POLL_EVERY_MS);
  }
} finally {
  releaseWatcherLock();
  log(`WATCHER exit (pid ${process.pid})`);
}
