import { HOOK_EVENT, type HookEvent, type HookPayload } from "#domain/hook-event.ts";
import { willCarryOn } from "#domain/ping/hook-ping.ts";
import { impossible } from "#domain/impossible.ts";
import {
  isTurnOwner,
  sideSessionsReportingIn,
  ownerAfter,
  TURN_OWNER,
  type TurnOwner,
} from "#domain/session/prompt-origin.ts";


export const SESSION_ACTIVITY = {
  working: "working",
  waitingAtTurnEnd: "waiting-at-turn-end",
  waitingOnAWall: "waiting-on-a-wall",
} as const;

export type SessionActivity =
  | { kind: typeof SESSION_ACTIVITY.working }
  | { kind: typeof SESSION_ACTIVITY.waitingAtTurnEnd }
  | { kind: typeof SESSION_ACTIVITY.waitingOnAWall; toolUseId: string | null };

export type SessionNote = {
  activity: SessionActivity;
  transcriptPath: string | null;
  at: number;
  turnOwner: TurnOwner;
  sideSessions: string[];
};

const LONGEST_SIDE_SESSION_SILENCE_MINUTES = 30;
const MILLISECONDS_PER_MINUTE = 60_000;
const NEVER_SEEN = 0;

const ACTIVITY_KINDS = new Set<string>(Object.values(SESSION_ACTIVITY));

export const isSessionActivity = (candidate: unknown): candidate is SessionActivity =>
  typeof candidate === "object" &&
  candidate !== null &&
  ACTIVITY_KINDS.has((candidate as { kind?: unknown }).kind as string);

const isText = (candidate: unknown): candidate is string => typeof candidate === "string";

export const asSessionNote = (candidate: unknown): SessionNote | null => {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const found = candidate as Partial<Record<keyof SessionNote, unknown>>;

  if (!isSessionActivity(found.activity)) {
    return null;
  }

  return {
    activity: found.activity,
    transcriptPath: isText(found.transcriptPath) ? found.transcriptPath : null,
    at: typeof found.at === "number" ? found.at : NEVER_SEEN,
    turnOwner: isTurnOwner(found.turnOwner) ? found.turnOwner : TURN_OWNER.user,
    sideSessions: Array.isArray(found.sideSessions) ? found.sideSessions.filter(isText) : [],
  };
};

export const activityAfter = (
  event: HookEvent,
  payload: HookPayload,
  sideSessionAtWork: boolean
): SessionActivity => {
  if (willCarryOn(event, payload, sideSessionAtWork)) {
    return { kind: SESSION_ACTIVITY.working };
  }

  switch (event) {
    case HOOK_EVENT.userPromptSubmit:
      return { kind: SESSION_ACTIVITY.working };

    case HOOK_EVENT.stop:
    case HOOK_EVENT.stopFailure:
    case HOOK_EVENT.notification:
      return { kind: SESSION_ACTIVITY.waitingAtTurnEnd };

    case HOOK_EVENT.permissionRequest:
    case HOOK_EVENT.preToolUse:
      return { kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: payload.tool_use_id ?? null };

    default:
      return impossible(event);
  }
};

const ownerFor = (event: HookEvent, payload: HookPayload, previous: SessionNote | null): TurnOwner => {
  const before = previous?.turnOwner ?? TURN_OWNER.user;

  return event === HOOK_EVENT.userPromptSubmit ? ownerAfter(payload.prompt, before) : before;
};

const sideSessionsFor = (
  event: HookEvent,
  payload: HookPayload,
  previous: SessionNote | null
): string[] => [
  ...new Set([
    ...(previous?.sideSessions ?? []),
    ...(event === HOOK_EVENT.userPromptSubmit ? sideSessionsReportingIn(payload.prompt) : []),
  ]),
];

export const noteAfter = (
  event: HookEvent,
  payload: HookPayload,
  now: number,
  previous: SessionNote | null,
  sideSessionAtWork: boolean
): SessionNote => ({
  activity: activityAfter(event, payload, sideSessionAtWork),
  transcriptPath: payload.transcript_path ?? null,
  at: now,
  turnOwner: ownerFor(event, payload, previous),
  sideSessions: sideSessionsFor(event, payload, previous),
});

export const aSideSessionIsAtWork = (
  sideSessionNotes: readonly (SessionNote | null)[],
  now: number
): boolean =>
  sideSessionNotes.some(
    (note) =>
      note !== null &&
      note.turnOwner === TURN_OWNER.anotherSession &&
      note.activity.kind === SESSION_ACTIVITY.working &&
      now - note.at < LONGEST_SIDE_SESSION_SILENCE_MINUTES * MILLISECONDS_PER_MINUTE
  );

export const wallToCheck = (note: SessionNote): { transcriptPath: string; toolUseId: string } | null =>
  note.activity.kind === SESSION_ACTIVITY.waitingOnAWall &&
  note.activity.toolUseId !== null &&
  note.transcriptPath !== null
    ? { transcriptPath: note.transcriptPath, toolUseId: note.activity.toolUseId }
    : null;

export const mayGoOut = (note: SessionNote | null, wallCameDown: boolean): boolean => {
  if (note === null) {
    return true;
  }

  switch (note.activity.kind) {
    case SESSION_ACTIVITY.working:
      return false;

    case SESSION_ACTIVITY.waitingAtTurnEnd:
      return true;

    case SESSION_ACTIVITY.waitingOnAWall:
      return !wallCameDown;

    default:
      return impossible(note.activity);
  }
};
