import { describe, expect, it } from "vitest";

import type { HookPayload } from "#domain/hook-event.ts";
import {
  HELD_VERDICT,
  heldVerdict,
  noteAfterRinging,
  SAFETY_NET_SOUND,
  TURN_END,
  turnEndVerdict,
  type HeldTurnEnd,
} from "#domain/ping/held-turn-end.ts";
import { SOUND } from "#domain/ping/hook-sound.ts";
import { SESSION_ACTIVITY, type SessionNote } from "#domain/session/session-activity.ts";
import { TURN_OWNER } from "#domain/session/prompt-origin.ts";


const HELD_AT = Date.parse("2026-11-18T09:47:25Z");
const MINUTE = 60_000;
const SAFETY_NET_MINUTES = 30;
const JUST_SHORT_OF_IT = SAFETY_NET_MINUTES * MINUTE - 1;
const SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SIDE_SESSION = "11111111-2222-3333-4444-555555555555";
const TRANSCRIPT = "C:\\sessions\\one.jsonl";

const agentRunning: HookPayload = {
  cwd: "D:\\Temp\\a-project",
  session_id: SESSION,
  transcript_path: TRANSCRIPT,
  background_tasks: [{ type: "subagent", status: "running" }],
};

const held: HeldTurnEnd = {
  sessionId: SESSION,
  heldAt: HELD_AT,
  transcriptPath: TRANSCRIPT,
  ping: { message: "[a-project] закончил ход, ждёт тебя", rateLimitMinutes: 10 },
};

const noteAt = (at: number): SessionNote => ({
  activity: { kind: SESSION_ACTIVITY.working },
  transcriptPath: TRANSCRIPT,
  at,
  turnOwner: TURN_OWNER.user,
  sideSessions: [],
});

const usersTurn = { turnOwner: TURN_OWNER.user, sideSessionAtWork: false };
const anotherSessionsTurn = { turnOwner: TURN_OWNER.anotherSession, sideSessionAtWork: false };
const sideSessionAtWork = { turnOwner: TURN_OWNER.user, sideSessionAtWork: true };

const nothingRunning: HookPayload = { ...agentRunning, background_tasks: [] };

describe("turnEndVerdict", () => {
  it("holds a turn end the agent will carry on from, with the ping it would have sent", () => {
    expect(turnEndVerdict("Stop", agentRunning, HELD_AT, usersTurn)).toEqual({ kind: TURN_END.hold, held });
  });

  it("speaks at once for a turn end that asks the user something, whatever is running", () => {
    expect(
      turnEndVerdict("Stop", { ...agentRunning, last_assistant_message: "Делаем?" }, HELD_AT, usersTurn)
    ).toEqual({ kind: TURN_END.speak });
  });

  it("speaks at once for a turn end nothing will resume", () => {
    expect(turnEndVerdict("Stop", nothingRunning, HELD_AT, usersTurn)).toEqual({
      kind: TURN_END.speak,
    });
  });

  it("speaks at once for an event other than a turn end, whatever is running", () => {
    expect(turnEndVerdict("PreToolUse", agentRunning, HELD_AT, usersTurn)).toEqual({ kind: TURN_END.speak });
  });

  it("carries on unheld for a session it cannot name, since nothing could tell it was superseded", () => {
    const { session_id: _unnamed, ...nameless } = agentRunning;

    expect(turnEndVerdict("Stop", nameless, HELD_AT, usersTurn)).toEqual({ kind: TURN_END.carryOnUnheld });
  });

  it("remembers no transcript when the payload carried none", () => {
    const { transcript_path: _none, ...withoutTranscript } = agentRunning;

    expect(turnEndVerdict("Stop", withoutTranscript, HELD_AT, usersTurn)).toEqual({
      kind: TURN_END.hold,
      held: { ...held, transcriptPath: null },
    });
  });

  describe("a turn another session asked for", () => {
    it("stays silent, since the session that asked gets the report and the user does not", () => {
      expect(turnEndVerdict("Stop", nothingRunning, HELD_AT, anotherSessionsTurn)).toEqual({
        kind: TURN_END.anotherSessionsTurn,
      });
    });

    it("stays silent even when it ends on a question, which goes to the session that asked", () => {
      expect(
        turnEndVerdict("Stop", { ...nothingRunning, last_assistant_message: "Мержим?" }, HELD_AT, anotherSessionsTurn)
      ).toEqual({ kind: TURN_END.anotherSessionsTurn });
    });

    it("stays silent rather than holding when its own agent still runs", () => {
      expect(turnEndVerdict("Stop", agentRunning, HELD_AT, anotherSessionsTurn)).toEqual({
        kind: TURN_END.anotherSessionsTurn,
      });
    });

    it("still speaks when the turn failed, since a failure is worth hearing first-hand", () => {
      expect(turnEndVerdict("StopFailure", nothingRunning, HELD_AT, anotherSessionsTurn)).toEqual({
        kind: TURN_END.speak,
      });
    });

    it("still speaks for a question dialog, which only the user can answer", () => {
      expect(turnEndVerdict("PreToolUse", nothingRunning, HELD_AT, anotherSessionsTurn)).toEqual({
        kind: TURN_END.speak,
      });
    });
  });

  describe("a session it started still at work", () => {
    it("holds the turn end, since that session will report back and wake this one", () => {
      expect(turnEndVerdict("Stop", nothingRunning, HELD_AT, sideSessionAtWork)).toEqual({
        kind: TURN_END.hold,
        held,
      });
    });

    it("speaks at once when the turn ends on a question", () => {
      expect(
        turnEndVerdict("Stop", { ...nothingRunning, last_assistant_message: "Делаем?" }, HELD_AT, sideSessionAtWork)
      ).toEqual({ kind: TURN_END.speak });
    });
  });
});

describe("SAFETY_NET_SOUND", () => {
  it("is the turn-ended sound, since the net rings for a turn that ended", () => {
    expect(SAFETY_NET_SOUND).toBe(SOUND.turnEnded);
  });
});

describe("heldVerdict", () => {
  it("waits while the session has been quiet for less than the safety net", () => {
    expect(heldVerdict(held, noteAt(HELD_AT), HELD_AT + JUST_SHORT_OF_IT)).toBe(HELD_VERDICT.waiting);
  });

  it("rings once the session has been quiet for the whole safety net", () => {
    expect(heldVerdict(held, noteAt(HELD_AT), HELD_AT + SAFETY_NET_MINUTES * MINUTE)).toBe(
      HELD_VERDICT.ring
    );
  });

  it("lets it go once anything newer happened in the session, however long ago it was held", () => {
    expect(heldVerdict(held, noteAt(HELD_AT + MINUTE), HELD_AT + 2 * SAFETY_NET_MINUTES * MINUTE)).toBe(
      HELD_VERDICT.superseded
    );
  });

  it("lets it go when the session's note is gone, since nothing can prove the quiet", () => {
    expect(heldVerdict(held, null, HELD_AT + SAFETY_NET_MINUTES * MINUTE)).toBe(HELD_VERDICT.superseded);
  });
});

describe("noteAfterRinging", () => {
  it("marks the session as waiting at a turn end, so a queued ping for it may go out", () => {
    const later = HELD_AT + SAFETY_NET_MINUTES * MINUTE;

    expect(noteAfterRinging(held, noteAt(HELD_AT), later)).toEqual({
      activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
      transcriptPath: TRANSCRIPT,
      at: later,
      turnOwner: TURN_OWNER.user,
      sideSessions: [],
    });
  });

  it("keeps who started the turn and the sessions it started", () => {
    const remembered = {
      ...noteAt(HELD_AT),
      turnOwner: TURN_OWNER.anotherSession,
      sideSessions: [SIDE_SESSION],
    };

    expect(noteAfterRinging(held, remembered, HELD_AT + MINUTE)).toMatchObject({
      turnOwner: TURN_OWNER.anotherSession,
      sideSessions: [SIDE_SESSION],
    });
  });

  it("falls back to a turn the user started when the note is gone", () => {
    expect(noteAfterRinging(held, null, HELD_AT + MINUTE)).toMatchObject({
      turnOwner: TURN_OWNER.user,
      sideSessions: [],
    });
  });
});
