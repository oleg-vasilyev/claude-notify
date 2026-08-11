import { describe, expect, it } from "vitest";

import type { HookPayload } from "#domain/hook-event.ts";
import {
  activityAfter,
  isSessionActivity,
  mayGoOut,
  noteAfter,
  SESSION_ACTIVITY,
  wallToCheck,
  type SessionNote,
} from "#domain/ping/session-activity.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const TRANSCRIPT = "C:\\sessions\\one.jsonl";
const TOOL_USE = "toolu_0000000000000000000001";
const CAME_DOWN = true;
const STILL_STANDING = false;

const payload: HookPayload = { transcript_path: TRANSCRIPT, tool_use_id: TOOL_USE };

const note = (activity: SessionNote["activity"]): SessionNote => ({
  activity,
  transcriptPath: TRANSCRIPT,
  at: NOW,
});

describe("activityAfter", () => {
  it("reads a finished turn as a session waiting for the user", () => {
    expect(activityAfter("Stop", payload)).toEqual({ kind: SESSION_ACTIVITY.waitingAtTurnEnd });
  });

  it("reads a submitted prompt as the user coming back and work resuming", () => {
    expect(activityAfter("UserPromptSubmit", payload)).toEqual({ kind: SESSION_ACTIVITY.working });
  });

  it("reads a permission prompt as a wall, and remembers which tool raised it", () => {
    expect(activityAfter("PermissionRequest", payload)).toEqual({
      kind: SESSION_ACTIVITY.waitingOnAWall,
      toolUseId: TOOL_USE,
    });
  });

  it("reads a question dialog as a wall too", () => {
    expect(activityAfter("PreToolUse", payload)).toEqual({
      kind: SESSION_ACTIVITY.waitingOnAWall,
      toolUseId: TOOL_USE,
    });
  });

  it("reads a turn that ended with background work still running as working", () => {
    const stillBusy: HookPayload = { ...payload, background_tasks: [{ id: "one" }] };

    expect(activityAfter("Stop", stillBusy)).toEqual({ kind: SESSION_ACTIVITY.working });
  });

  it("survives a wall whose payload names no tool call", () => {
    expect(activityAfter("PermissionRequest", {})).toEqual({
      kind: SESSION_ACTIVITY.waitingOnAWall,
      toolUseId: null,
    });
  });
});

describe("noteAfter", () => {
  it("keeps the transcript the session writes to, and when the note was taken", () => {
    expect(noteAfter("Stop", payload, NOW)).toEqual({
      activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
      transcriptPath: TRANSCRIPT,
      at: NOW,
    });
  });

  it("records no transcript when the payload carries none", () => {
    expect(noteAfter("Stop", {}, NOW).transcriptPath).toBeNull();
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
      activity: { kind: SESSION_ACTIVITY.waitingOnAWall, toolUseId: TOOL_USE },
      transcriptPath: null,
      at: NOW,
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
