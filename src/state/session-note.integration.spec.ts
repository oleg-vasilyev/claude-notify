import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_ACTIVITY, type SessionNote } from "#domain/ping/session-activity.ts";
import { readSessionNote, writeSessionNote } from "#state/session-note.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-notes-"));
});

vi.mock("#state/file-locations.ts", () => ({
  stateHome: () => state,
  sessionNoteFile: (sessionId: string) => join(state, `session-${sessionId}.json`),
}));

const A_SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ANOTHER_SESSION = "11111111-2222-3333-4444-555555555555";
const AT = 1_700_000_000_000;

const waiting: SessionNote = {
  activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
  transcriptPath: "C:\\sessions\\one.jsonl",
  at: AT,
};

describe("what a session was last seen doing", () => {
  beforeEach(() => {
    rmSync(join(state, `session-${A_SESSION}.json`), { force: true });
  });

  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("reads back the note it wrote", () => {
    writeSessionNote(A_SESSION, waiting);

    expect(readSessionNote(A_SESSION)).toEqual(waiting);
  });

  it("keeps a note per session, so one session cannot answer for another", () => {
    writeSessionNote(A_SESSION, waiting);

    expect(readSessionNote(ANOTHER_SESSION)).toBeNull();
  });

  it("knows nothing about a session that has never fired a hook", () => {
    expect(readSessionNote(A_SESSION)).toBeNull();
  });

  it("replaces the note rather than accumulating them", () => {
    writeSessionNote(A_SESSION, waiting);
    writeSessionNote(A_SESSION, { ...waiting, activity: { kind: SESSION_ACTIVITY.working } });

    expect(readSessionNote(A_SESSION)?.activity.kind).toBe(SESSION_ACTIVITY.working);
  });

  it("treats a half-written note as no note, rather than as a session that is working", () => {
    writeFileSync(join(state, `session-${A_SESSION}.json`), '{"activity":', "utf8");

    expect(readSessionNote(A_SESSION)).toBeNull();
  });

  it("treats a note with no activity in it as no note at all", () => {
    writeFileSync(join(state, `session-${A_SESSION}.json`), '{"at":1}', "utf8");

    expect(readSessionNote(A_SESSION)).toBeNull();
  });

  it("refuses an activity this version has never heard of, rather than passing it to a switch", () => {
    writeFileSync(
      join(state, `session-${A_SESSION}.json`),
      '{"activity":{"kind":"hibernating"},"transcriptPath":null,"at":1}',
      "utf8"
    );

    expect(readSessionNote(A_SESSION)).toBeNull();
  });
});
