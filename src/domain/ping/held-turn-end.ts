import type { HookEvent, HookPayload } from "#domain/hook-event.ts";
import { turnEndPing, willCarryOn, type HookPing } from "#domain/ping/hook-ping.ts";
import { SOUND, type Sound } from "#domain/ping/hook-sound.ts";
import { SESSION_ACTIVITY, type SessionNote } from "#domain/ping/session-activity.ts";


const SAFETY_NET_MINUTES = 30;
const MILLISECONDS_PER_MINUTE = 60_000;

export const SAFETY_NET_SOUND: Sound = SOUND.turnEnded;

export type HeldTurnEnd = {
  sessionId: string;
  heldAt: number;
  transcriptPath: string | null;
  ping: HookPing;
};

export const TURN_END = {
  speak: "speak",
  hold: "hold",
  carryOnUnheld: "carry-on-unheld",
} as const;

export type TurnEndVerdict =
  | { kind: typeof TURN_END.speak }
  | { kind: typeof TURN_END.hold; held: HeldTurnEnd }
  | { kind: typeof TURN_END.carryOnUnheld };

export const turnEndVerdict = (
  event: HookEvent,
  payload: HookPayload,
  now: number
): TurnEndVerdict => {
  if (!willCarryOn(event, payload)) {
    return { kind: TURN_END.speak };
  }

  if (typeof payload.session_id !== "string") {
    return { kind: TURN_END.carryOnUnheld };
  }

  return {
    kind: TURN_END.hold,
    held: {
      sessionId: payload.session_id,
      heldAt: now,
      transcriptPath: payload.transcript_path ?? null,
      ping: turnEndPing(payload),
    },
  };
};

export const HELD_VERDICT = {
  superseded: "superseded",
  waiting: "waiting",
  ring: "ring",
} as const;

export type HeldVerdict = (typeof HELD_VERDICT)[keyof typeof HELD_VERDICT];

export const heldVerdict = (held: HeldTurnEnd, note: SessionNote | null, now: number): HeldVerdict => {
  if (note === null || note.at !== held.heldAt) {
    return HELD_VERDICT.superseded;
  }

  return now - held.heldAt >= SAFETY_NET_MINUTES * MILLISECONDS_PER_MINUTE
    ? HELD_VERDICT.ring
    : HELD_VERDICT.waiting;
};

export const noteAfterRinging = (held: HeldTurnEnd, now: number): SessionNote => ({
  activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
  transcriptPath: held.transcriptPath,
  at: now,
});
