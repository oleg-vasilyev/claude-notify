import { describe, expect, it } from "vitest";

import type { HookPayload } from "#domain/hook-event.ts";
import { SOUND, soundFor } from "#domain/ping/hook-sound.ts";


const NO_PAYLOAD: HookPayload = {};
const askingTheUser: HookPayload = { tool_name: "AskUserQuestion" };
const writingAFile: HookPayload = { tool_name: "Write" };

describe("soundFor", () => {
  it("plays the turn-ended sound when the turn ended", () => {
    expect(soundFor("Stop", NO_PAYLOAD)).toBe(SOUND.turnEnded);
  });

  it("plays a different sound mid-turn, so a question is not heard as a finished turn", () => {
    expect(soundFor("PreToolUse", askingTheUser)).toBe(SOUND.waitingOnYou);
    expect(soundFor("PermissionRequest", writingAFile)).toBe(SOUND.waitingOnYou);
    expect(soundFor("Notification", NO_PAYLOAD)).toBe(SOUND.waitingOnYou);
  });

  it("stays silent on the PermissionRequest that PreToolUse owns, so one question makes one sound", () => {
    expect(soundFor("PermissionRequest", askingTheUser)).toBeNull();
  });

  it("stays silent when the user writes, since nobody is waiting on themselves", () => {
    expect(soundFor("UserPromptSubmit", NO_PAYLOAD)).toBeNull();
  });

  it("names a sound rather than a file, so which wav plays is the machine's business", () => {
    expect(soundFor("Stop", NO_PAYLOAD)).not.toBe(soundFor("Notification", NO_PAYLOAD));
    expect(SOUND.turnEnded).not.toContain("\\");
  });
});
