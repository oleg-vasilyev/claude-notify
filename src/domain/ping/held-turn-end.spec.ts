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
import { SESSION_ACTIVITY, type SessionNote } from "#domain/ping/session-activity.ts";


const HELD_AT = Date.parse("2026-11-18T09:47:25Z");
const MINUTE = 60_000;
const SAFETY_NET_MINUTES = 30;
const JUST_SHORT_OF_IT = SAFETY_NET_MINUTES * MINUTE - 1;
const SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
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
});

describe("turnEndVerdict", () => {
  it("holds a turn end the agent will carry on from, with the ping it would have sent", () => {
    expect(turnEndVerdict("Stop", agentRunning, HELD_AT)).toEqual({ kind: TURN_END.hold, held });
  });

  it("speaks at once for a turn end that asks the user something, whatever is running", () => {
    expect(
      turnEndVerdict("Stop", { ...agentRunning, last_assistant_message: "Делаем?" }, HELD_AT)
    ).toEqual({ kind: TURN_END.speak });
  });

  it("speaks at once for a turn end nothing will resume", () => {
    expect(turnEndVerdict("Stop", { ...agentRunning, background_tasks: [] }, HELD_AT)).toEqual({
      kind: TURN_END.speak,
    });
  });

  it("speaks at once for an event other than a turn end, whatever is running", () => {
    expect(turnEndVerdict("PreToolUse", agentRunning, HELD_AT)).toEqual({ kind: TURN_END.speak });
  });

  it("carries on unheld for a session it cannot name, since nothing could tell it was superseded", () => {
    const { session_id: _unnamed, ...nameless } = agentRunning;

    expect(turnEndVerdict("Stop", nameless, HELD_AT)).toEqual({ kind: TURN_END.carryOnUnheld });
  });

  it("remembers no transcript when the payload carried none", () => {
    const { transcript_path: _none, ...withoutTranscript } = agentRunning;

    expect(turnEndVerdict("Stop", withoutTranscript, HELD_AT)).toEqual({
      kind: TURN_END.hold,
      held: { ...held, transcriptPath: null },
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

    expect(noteAfterRinging(held, later)).toEqual({
      activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
      transcriptPath: TRANSCRIPT,
      at: later,
    });
  });
});
