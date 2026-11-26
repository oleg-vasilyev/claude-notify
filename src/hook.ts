import { isHookEvent, type HookPayload } from "#domain/hook-event.ts";
import { TURN_END, turnEndVerdict } from "#domain/ping/held-turn-end.ts";
import {
  endlessWork,
  monitorsIn,
  nobodyIsWatching,
  pingFor,
  unfamiliarWork,
} from "#domain/ping/hook-ping.ts";
import { impossible } from "#domain/impossible.ts";
import { soundFor } from "#domain/ping/hook-sound.ts";
import { aSideSessionIsAtWork, noteAfter } from "#domain/session/session-activity.ts";
import { playSound } from "#sound/play-sound.ts";
import { readConfig } from "#state/config.ts";
import { holdTurnEnd } from "#state/held-turn-end-files.ts";
import { flattenPayload, labelLogWith, log } from "#state/log.ts";
import { readSessionNote, writeSessionNote } from "#state/session-note.ts";
import { ask } from "#app/ask.ts";
import { deliver } from "#app/deliver.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


const NOTHING_TO_SAY = 0;

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const parsed = (raw: string): HookPayload => {
  try {
    return JSON.parse(raw) as HookPayload;
  } catch {
    return {};
  }
};

const event = process.argv[2] ?? "";

if (!isHookEvent(event)) {
  log(`WARN hook called with an unknown event: ${event}`);
  process.exit(0);
}

const raw = await readStdin();

const payload = parsed(raw);

const sessionId = typeof payload.session_id === "string" ? payload.session_id : null;

if (sessionId !== null) {
  labelLogWith(sessionId);
}

const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;

log(`HOOK ${event} entrypoint=${entrypoint ?? "-"} | ${flattenPayload(raw)}`);

if (nobodyIsWatching(entrypoint)) {
  log(`SKIP a session a script is running | ${event}`);
  process.exit(0);
}

const now = Date.now();

const previous = sessionId === null ? null : readSessionNote(sessionId);
const sideSessionAtWork = aSideSessionIsAtWork(
  (previous?.sideSessions ?? []).map(readSessionNote),
  now
);
const note = noteAfter(event, payload, now, previous, sideSessionAtWork);

if (sessionId !== null) {
  writeSessionNote(sessionId, note);
}

const unfamiliar = unfamiliarWork(payload);

if (unfamiliar.length > NOTHING_TO_SAY) {
  log(`BACKGROUND not counted as work | ${unfamiliar.join(" ")}`);
}

const endless = endlessWork(payload);

if (endless.length > NOTHING_TO_SAY) {
  log(`ENDLESS not counted as work | ${flattenPayload(endless.join(" | "))}`);
}

for (const monitor of monitorsIn(payload)) {
  log(`MONITOR ${flattenPayload(monitor)}`);
}

const speak = async (): Promise<void> => {
  const sound = soundFor(event, payload);

  if (sound !== null) {
    playSound(sound);
    log(`SOUND ${sound} | ${event}`);
  }

  const ping = pingFor(event, payload, readConfig()?.quoteQuestions === true);

  if (ping === null) {
    return;
  }

  const answered = await ask(event, payload);

  if (answered === null) {
    await deliver({ ...ping, sessionId });
  } else if (Object.keys(answered).length > NOTHING_TO_SAY) {
    process.stdout.write(JSON.stringify(answered));
  }
};

const verdict = turnEndVerdict(event, payload, now, {
  turnOwner: note.turnOwner,
  sideSessionAtWork,
});

switch (verdict.kind) {
  case TURN_END.speak:
    await speak();
    break;

  case TURN_END.hold:
    holdTurnEnd(verdict.held);
    log(`SKIP the turn ended but the agent will carry on, held for the safety net | ${event}`);

    if (!watcherIsRunning()) {
      startWatcher();
    }

    break;

  case TURN_END.carryOnUnheld:
    log(`SKIP the turn ended but the agent will carry on | ${event}`);
    break;

  case TURN_END.anotherSessionsTurn:
    log(`SKIP the turn was another session's errand, and that session gets the report | ${event}`);
    break;

  default:
    impossible(verdict);
}
