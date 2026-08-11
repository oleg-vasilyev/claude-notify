import { HOOK_EVENT, type HookEvent, type HookPayload } from "#domain/hook-event.ts";
import { stillWorking } from "#domain/ping/hook-ping.ts";
import { impossible } from "#domain/impossible.ts";


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
};

const ACTIVITY_KINDS = new Set<string>(Object.values(SESSION_ACTIVITY));

export const isSessionActivity = (candidate: unknown): candidate is SessionActivity =>
  typeof candidate === "object" &&
  candidate !== null &&
  ACTIVITY_KINDS.has((candidate as { kind?: unknown }).kind as string);

export const activityAfter = (event: HookEvent, payload: HookPayload): SessionActivity => {
  if (stillWorking(event, payload)) {
    return { kind: SESSION_ACTIVITY.working };
  }

  switch (event) {
    case HOOK_EVENT.userPromptSubmit:
      return { kind: SESSION_ACTIVITY.working };

    case HOOK_EVENT.stop:
    case HOOK_EVENT.notification:
      return { kind: SESSION_ACTIVITY.waitingAtTurnEnd };

    case HOOK_EVENT.permissionRequest:
    case HOOK_EVENT.preToolUse:
      return { kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: payload.tool_use_id ?? null };

    default:
      return impossible(event);
  }
};

export const noteAfter = (event: HookEvent, payload: HookPayload, now: number): SessionNote => ({
  activity: activityAfter(event, payload),
  transcriptPath: payload.transcript_path ?? null,
  at: now,
});

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
