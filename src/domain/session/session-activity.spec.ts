import { describe, expect, it } from "vitest";

import type { HookPayload } from "#domain/hook-event.ts";
import {
  activityAfter,
  aSideSessionIsAtWork,
  asSessionNote,
  isSessionActivity,
  mayGoOut,
  noteAfter,
  SESSION_ACTIVITY,
  wallToCheck,
  type SessionNote,
} from "#domain/session/session-activity.ts";
import { TURN_OWNER } from "#domain/session/prompt-origin.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const TRANSCRIPT = "C:\\sessions\\one.jsonl";
const TOOL_USE = "toolu_0000000000000000000001";
const CAME_DOWN = true;
const STILL_STANDING = false;
const NO_SIDE_SESSION_AT_WORK = false;
const SIDE_SESSION_AT_WORK = true;
const MINUTE = 60_000;
const LONGEST_SIDE_SESSION_SILENCE_MINUTES = 30;
const NEVER_SEEN = 0;
const SIDE_SESSION = "11111111-2222-3333-4444-555555555555";
const ANOTHER_SIDE_SESSION = "66666666-7777-8888-9999-000000000000";
const reportFrom = (sessionId: string): string =>
  `<system-reminder>\nThe session "Specs for the relay" you started (local_0000) finished a turn. Its Claude Code session is ${sessionId}. It reported: "Спеки зелёные."\n</system-reminder>`;
const MESSAGE_FROM_ANOTHER_SESSION =
  'Another Claude session sent a message:\n<cross-session-message from="local_0000">Прогони e2e.</cross-session-message>';
const TASK_FINISHED = "<task-notification>\n<task-id>b0000</task-id>\n</task-notification>";

const payload: HookPayload = { transcript_path: TRANSCRIPT, tool_use_id: TOOL_USE };

const note = (activity: SessionNote["activity"]): SessionNote => ({
  activity,
  transcriptPath: TRANSCRIPT,
  at: NOW,
  turnOwner: TURN_OWNER.user,
  sideSessions: [],
});

describe("activityAfter", () => {
  it("reads a finished turn as a session waiting for the user", () => {
    expect(activityAfter("Stop", payload, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.waitingAtTurnEnd });
  });

  it("reads a submitted prompt as the user coming back and work resuming", () => {
    expect(activityAfter("UserPromptSubmit", payload, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.working });
  });

  it("reads a permission prompt as a wall, and remembers which tool raised it", () => {
    expect(activityAfter("PermissionRequest", payload, NO_SIDE_SESSION_AT_WORK)).toEqual({
      kind: SESSION_ACTIVITY.waitingOnAWall,
      toolUseId: TOOL_USE,
    });
  });

  it("reads a question dialog as a wall too", () => {
    expect(activityAfter("PreToolUse", payload, NO_SIDE_SESSION_AT_WORK)).toEqual({
      kind: SESSION_ACTIVITY.waitingOnAWall,
      toolUseId: TOOL_USE,
    });
  });

  it("reads a turn that ended with a subagent still running as working", () => {
    const stillBusy: HookPayload = {
      ...payload,
      background_tasks: [{ type: "subagent", status: "running" }],
    };

    expect(activityAfter("Stop", stillBusy, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.working });
  });

  it("reads a turn that ended with only a monitor armed as waiting, since nothing will resume it", () => {
    const watched: HookPayload = {
      ...payload,
      background_tasks: [{ type: "monitor", status: "running" }],
    };

    expect(activityAfter("Stop", watched, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.waitingAtTurnEnd });
  });

  it("reads a turn that ended while the Monitor tool follows a log as working, since it wakes the agent", () => {
    const watching: HookPayload = {
      ...payload,
      background_tasks: [
        { type: "shell", status: "running", command: 'tail -n +1 -F logs/gate.log | grep --line-buffered "^verdict:"' },
      ],
    };

    expect(activityAfter("Stop", watching, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.working });
  });

  it("reads a turn that ended on a question as waiting, even with a subagent still running", () => {
    const askedWhileBusy: HookPayload = {
      ...payload,
      background_tasks: [{ type: "subagent", status: "running" }],
      last_assistant_message: "Агент ещё пишет спеки. Коммитить в `main`?",
    };

    expect(activityAfter("Stop", askedWhileBusy, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.waitingAtTurnEnd });
  });

  it("reads a turn that ended with only a server running as waiting, since a server never exits", () => {
    const serving: HookPayload = {
      ...payload,
      background_tasks: [{ type: "shell", status: "running", command: "pnpm dev" }],
    };

    expect(activityAfter("Stop", serving, NO_SIDE_SESSION_AT_WORK)).toEqual({ kind: SESSION_ACTIVITY.waitingAtTurnEnd });
  });

  it("reads a failed turn as a session waiting for the user, even with an agent still running", () => {
    const failedWhileBusy: HookPayload = {
      ...payload,
      background_tasks: [{ type: "subagent", status: "running" }],
    };

    expect(activityAfter("StopFailure", failedWhileBusy, NO_SIDE_SESSION_AT_WORK)).toEqual({
      kind: SESSION_ACTIVITY.waitingAtTurnEnd,
    });
  });

  it("survives a wall whose payload names no tool call", () => {
    expect(activityAfter("PermissionRequest", {}, NO_SIDE_SESSION_AT_WORK)).toEqual({
      kind: SESSION_ACTIVITY.waitingOnAWall,
      toolUseId: null,
    });
  });
});

describe("noteAfter", () => {
  it("keeps the transcript the session writes to, and when the note was taken", () => {
    expect(noteAfter("Stop", payload, NOW, null, NO_SIDE_SESSION_AT_WORK)).toEqual({
      activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
      transcriptPath: TRANSCRIPT,
      at: NOW,
      turnOwner: TURN_OWNER.user,
      sideSessions: [],
    });
  });

  it("records no transcript when the payload carries none", () => {
    expect(noteAfter("Stop", {}, NOW, null, NO_SIDE_SESSION_AT_WORK).transcriptPath).toBeNull();
  });

  it("reads a turn end as working while a session it started is at work", () => {
    expect(noteAfter("Stop", payload, NOW, null, SIDE_SESSION_AT_WORK).activity).toEqual({
      kind: SESSION_ACTIVITY.working,
    });
  });

  it("marks a turn another session asked for when its message arrives", () => {
    const asked = noteAfter(
      "UserPromptSubmit",
      { prompt: MESSAGE_FROM_ANOTHER_SESSION },
      NOW,
      note({ kind: SESSION_ACTIVITY.waitingAtTurnEnd }),
      NO_SIDE_SESSION_AT_WORK
    );

    expect(asked.turnOwner).toBe(TURN_OWNER.anotherSession);
  });

  it("keeps who started the turn through the events that follow the prompt", () => {
    const asked = { ...note({ kind: SESSION_ACTIVITY.working }), turnOwner: TURN_OWNER.anotherSession };

    expect(noteAfter("Stop", payload, NOW, asked, NO_SIDE_SESSION_AT_WORK).turnOwner).toBe(
      TURN_OWNER.anotherSession
    );
  });

  it("keeps who started the turn when the session's own background task wakes it", () => {
    const asked = { ...note({ kind: SESSION_ACTIVITY.working }), turnOwner: TURN_OWNER.anotherSession };

    expect(
      noteAfter("UserPromptSubmit", { prompt: TASK_FINISHED }, NOW, asked, NO_SIDE_SESSION_AT_WORK).turnOwner
    ).toBe(TURN_OWNER.anotherSession);
  });

  it("hands the turn back to the user once the user types", () => {
    const asked = { ...note({ kind: SESSION_ACTIVITY.working }), turnOwner: TURN_OWNER.anotherSession };

    expect(
      noteAfter("UserPromptSubmit", { prompt: "Покажи лог." }, NOW, asked, NO_SIDE_SESSION_AT_WORK).turnOwner
    ).toBe(TURN_OWNER.user);
  });

  it("reads who started the turn only from a prompt, never from a turn end that carries one", () => {
    const asked = { ...note({ kind: SESSION_ACTIVITY.working }), turnOwner: TURN_OWNER.anotherSession };

    expect(
      noteAfter("Stop", { prompt: "Покажи лог." }, NOW, asked, NO_SIDE_SESSION_AT_WORK).turnOwner
    ).toBe(TURN_OWNER.anotherSession);
  });

  it("starts a session it knows nothing about as the user's", () => {
    expect(noteAfter("Stop", payload, NOW, null, NO_SIDE_SESSION_AT_WORK).turnOwner).toBe(TURN_OWNER.user);
  });

  it("learns a session it started from that session's report", () => {
    const reported = noteAfter(
      "UserPromptSubmit",
      { prompt: reportFrom(SIDE_SESSION) },
      NOW,
      null,
      NO_SIDE_SESSION_AT_WORK
    );

    expect(reported.sideSessions).toEqual([SIDE_SESSION]);
  });

  it("adds a newly reporting session to the ones it already knew, once each", () => {
    const knew = { ...note({ kind: SESSION_ACTIVITY.working }), sideSessions: [SIDE_SESSION] };
    const prompt = `${reportFrom(SIDE_SESSION)}\n${reportFrom(ANOTHER_SIDE_SESSION)}`;

    expect(
      noteAfter("UserPromptSubmit", { prompt }, NOW, knew, NO_SIDE_SESSION_AT_WORK).sideSessions
    ).toEqual([SIDE_SESSION, ANOTHER_SIDE_SESSION]);
  });

  it("keeps the sessions it started across a turn end", () => {
    const knew = { ...note({ kind: SESSION_ACTIVITY.working }), sideSessions: [SIDE_SESSION] };

    expect(noteAfter("Stop", payload, NOW, knew, NO_SIDE_SESSION_AT_WORK).sideSessions).toEqual([
      SIDE_SESSION,
    ]);
  });

  it("reads side sessions only from a prompt, never from a turn end that carries one", () => {
    expect(
      noteAfter("Stop", { prompt: reportFrom(SIDE_SESSION) }, NOW, null, NO_SIDE_SESSION_AT_WORK).sideSessions
    ).toEqual([]);
  });
});

describe("aSideSessionIsAtWork", () => {
  const onAnErrand = (activity: SessionNote["activity"], at: number = NOW): SessionNote => ({
    ...note(activity),
    at,
    turnOwner: TURN_OWNER.anotherSession,
  });
  const atWork = (at: number): SessionNote => onAnErrand({ kind: SESSION_ACTIVITY.working }, at);

  it("is true when one of the sessions it started is working on its errand", () => {
    expect(
      aSideSessionIsAtWork([onAnErrand({ kind: SESSION_ACTIVITY.waitingAtTurnEnd }), atWork(NOW)], NOW)
    ).toBe(true);
  });

  it("is false when every session it started waits", () => {
    expect(aSideSessionIsAtWork([onAnErrand({ kind: SESSION_ACTIVITY.waitingAtTurnEnd })], NOW)).toBe(false);
  });

  it("is false for a session at a wall, which waits on the user rather than reporting back", () => {
    expect(
      aSideSessionIsAtWork([onAnErrand({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: TOOL_USE })], NOW)
    ).toBe(false);
  });

  it("is false for a session it started that now works for the user, which reports nothing back", () => {
    expect(aSideSessionIsAtWork([{ ...atWork(NOW), turnOwner: TURN_OWNER.user }], NOW)).toBe(false);
  });

  it("is false when it started none", () => {
    expect(aSideSessionIsAtWork([], NOW)).toBe(false);
  });

  it("is false when the notes of the sessions it started are gone", () => {
    expect(aSideSessionIsAtWork([null], NOW)).toBe(false);
  });

  it("still counts a session whose turn began just short of the limit ago", () => {
    const quietSince = NOW - LONGEST_SIDE_SESSION_SILENCE_MINUTES * MINUTE + 1;

    expect(aSideSessionIsAtWork([atWork(quietSince)], NOW)).toBe(true);
  });

  it("stops counting a working session quiet for the whole limit, since it may have been closed mid-turn", () => {
    const quietSince = NOW - LONGEST_SIDE_SESSION_SILENCE_MINUTES * MINUTE;

    expect(aSideSessionIsAtWork([atWork(quietSince)], NOW)).toBe(false);
  });
});

describe("asSessionNote", () => {
  const written = note({ kind: SESSION_ACTIVITY.waitingAtTurnEnd });

  it("takes a note this version wrote as it is", () => {
    expect(asSessionNote(written)).toEqual(written);
  });

  it("reads a note an older version wrote as a turn the user started, with no sessions started", () => {
    const { turnOwner: _none, sideSessions: _neither, ...older } = written;

    expect(asSessionNote(older)).toEqual(written);
  });

  it("refuses a note whose activity is not one this product writes", () => {
    expect(asSessionNote({ ...written, activity: { kind: "hibernating" } })).toBeNull();
  });

  it("refuses null, which parses and is not a note", () => {
    expect(asSessionNote(null)).toBeNull();
  });

  it("refuses a string, which parses and is not a note either", () => {
    expect(asSessionNote("working")).toBeNull();
  });

  it("drops what is not text from the sessions it started, and an owner nobody wrote", () => {
    expect(
      asSessionNote({ ...written, turnOwner: "a-ghost", sideSessions: [SIDE_SESSION, 7, null] })
    ).toEqual({ ...written, sideSessions: [SIDE_SESSION] });
  });

  it("reads a note with no transcript, no time and a list that is not one", () => {
    expect(asSessionNote({ activity: written.activity, transcriptPath: 7, sideSessions: "x" })).toEqual({
      ...written,
      transcriptPath: null,
      at: NEVER_SEEN,
    });
  });
});

describe("wallToCheck", () => {
  it("names the tool call whose answer would mean the wall came down", () => {
    expect(wallToCheck(note({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: TOOL_USE }))).toEqual(
      { transcriptPath: TRANSCRIPT, toolUseId: TOOL_USE }
    );
  });

  it("asks nothing of a session that is not at a wall", () => {
    expect(wallToCheck(note({ kind: SESSION_ACTIVITY.waitingAtTurnEnd }))).toBeNull();
  });

  it("asks nothing when the wall named no tool call", () => {
    expect(wallToCheck(note({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: null }))).toBeNull();
  });

  it("asks nothing when there is no transcript to read", () => {
    const noTranscript: SessionNote = {
      ...note({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: TOOL_USE }),
      transcriptPath: null,
    };

    expect(wallToCheck(noTranscript)).toBeNull();
  });
});

describe("isSessionActivity", () => {
  it("accepts every activity the table names", () => {
    expect(isSessionActivity({ kind: SESSION_ACTIVITY.working })).toBe(true);
    expect(isSessionActivity({ kind: SESSION_ACTIVITY.waitingAtTurnEnd })).toBe(true);
    expect(isSessionActivity({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: null })).toBe(true);
  });

  it("refuses a kind no version of this product wrote, rather than letting it reach a switch", () => {
    expect(isSessionActivity({ kind: "hibernating" })).toBe(false);
  });

  it("refuses anything that is not an object with a kind", () => {
    expect(isSessionActivity(null)).toBe(false);
    expect(isSessionActivity("working")).toBe(false);
    expect(isSessionActivity({})).toBe(false);
  });
});

describe("mayGoOut", () => {
  it("holds a ping while the session is working, since nobody is waiting on the user", () => {
    expect(mayGoOut(note({ kind: SESSION_ACTIVITY.working }), STILL_STANDING)).toBe(false);
  });

  it("lets a ping out once the turn has ended", () => {
    expect(mayGoOut(note({ kind: SESSION_ACTIVITY.waitingAtTurnEnd }), STILL_STANDING)).toBe(true);
  });

  it("lets a ping out while the wall it describes is still standing", () => {
    const wall = note({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: TOOL_USE });

    expect(mayGoOut(wall, STILL_STANDING)).toBe(true);
  });

  it("holds a ping once the wall came down, since the user already answered it", () => {
    const wall = note({ kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: TOOL_USE });

    expect(mayGoOut(wall, CAME_DOWN)).toBe(false);
  });

  it("lets a ping out for a session it knows nothing about, rather than swallowing it", () => {
    expect(mayGoOut(null, STILL_STANDING)).toBe(true);
  });
});
