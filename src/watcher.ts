import { setTimeout as sleep } from "node:timers/promises";

import { impossible } from "#domain/impossible.ts";
import {
  DROP,
  projectsIn,
  selectPending,
  sessionsIn,
  type DroppedPing,
  type PendingPing,
  type SentPing,
} from "#domain/ping/pending.ts";
import { mayGoOut, wallToCheck } from "#domain/ping/session-activity.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { readAskedQuestions } from "#state/asked-question.ts";
import { DELIVERY, readConfig } from "#state/config.ts";
import { readLastSent } from "#state/last-sent.ts";
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
const MILLISECONDS_PER_SECOND = 1000;
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

const sentPerProject = (pending: readonly PendingPing[]): Map<string, SentPing> => {
  const sent = new Map<string, SentPing>();

  for (const project of projectsIn(pending)) {
    const last = readLastSent(project);

    if (last !== null) {
      sent.set(project, last);
    }
  }

  return sent;
};

const whyDropped = (dropped: DroppedPing): string => {
  switch (dropped.kind) {
    case DROP.stale:
      return "DROP stale";

    case DROP.seen:
      return "DROP seen";

    case DROP.repeat:
      return "DROP repeat";

    default:
      return impossible(dropped);
  }
};

const flush = async (idleNow: number): Promise<void> => {
  const now = Date.now();
  const pending = readPending();

  const selection = selectPending(pending, {
    now,
    staleMinutes: config.staleMinutes,
    lastInputAt: now - idleNow * MILLISECONDS_PER_SECOND,
    sessionsThatMustWait: sessionsThatMustWait(pending),
    sentPerProject: sentPerProject(pending),
  });

  clearPending();

  for (const ping of selection.held) {
    appendPending(ping);
  }

  for (const dropped of selection.dropped) {
    const queuedAt = new Date(dropped.ping.queuedAt).toISOString();

    log(`${whyDropped(dropped)} (queued ${queuedAt}) | ${dropped.ping.message}`);
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

    const idleNow = idleSeconds();

    if (queued && idleNow >= config.minIdleMinutes * SECONDS_PER_MINUTE) {
      await flush(idleNow);
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
