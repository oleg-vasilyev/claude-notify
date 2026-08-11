import { describe, expect, it } from "vitest";

import {
  notifyArgv,
  nothingWasSent,
  outcomeReport,
  PING_OUTCOME,
  PING_TOOL,
  PING_TOOL_DESCRIPTION,
  PING_TOOL_TITLE,
  toolAnswer,
} from "#domain/ping/ping-tool.ts";


const IDLE_SECONDS = 12;
const A_MINUTE_AND_A_BIT = 1.7;

describe("outcomeReport", () => {
  it("says a ping reached the phone", () => {
    expect(outcomeReport({ kind: PING_OUTCOME.sent })).toContain("Delivered");
  });

  it("tells the model not to wait when the user is still at the keyboard", () => {
    const said = outcomeReport({ kind: PING_OUTCOME.queued, idleSeconds: IDLE_SECONDS });

    expect(said).toContain("12s");
    expect(said).toContain("Carry on");
  });

  it("reports the rate limit in whole minutes, since a fraction reads as noise", () => {
    const said = outcomeReport({
      kind: PING_OUTCOME.skipped,
      sinceLastSentMinutes: A_MINUTE_AND_A_BIT,
    });

    expect(said).toContain("1 minute(s) ago");
  });

  it("carries the reason a send failed, so the model can say what broke", () => {
    const said = outcomeReport({ kind: PING_OUTCOME.failed, why: "Telegram refused with 404" });

    expect(said).toContain("Telegram refused with 404");
    expect(said).toContain("hook");
  });

  it("admits when the machine has no notifier configured at all", () => {
    expect(outcomeReport({ kind: PING_OUTCOME.unconfigured })).toContain("not configured");
  });
});

describe("nothingWasSent", () => {
  it("treats a refused send as nothing sent, so the tool call reads as failed", () => {
    expect(nothingWasSent({ kind: PING_OUTCOME.failed, why: "404" })).toBe(true);
  });

  it("treats an unconfigured machine as nothing sent", () => {
    expect(nothingWasSent({ kind: PING_OUTCOME.unconfigured })).toBe(true);
  });

  it("treats a queued ping as sent, since it is held rather than lost", () => {
    expect(nothingWasSent({ kind: PING_OUTCOME.queued, idleSeconds: IDLE_SECONDS })).toBe(false);
  });

  it("treats a rate-limited ping as sent, since the earlier one covers it", () => {
    expect(nothingWasSent({ kind: PING_OUTCOME.skipped, sinceLastSentMinutes: 1 })).toBe(false);
  });

  it("treats delivery as sent", () => {
    expect(nothingWasSent({ kind: PING_OUTCOME.sent })).toBe(false);
  });
});

describe("toolAnswer", () => {
  const WORKED = 0;
  const BROKE = 1;

  it("relays what the notifier said", () => {
    expect(toolAnswer("Delivered to their phone.\n", "", WORKED)).toEqual({
      said: "Delivered to their phone.",
      failed: false,
    });
  });

  it("falls back to what the notifier complained about when it said nothing", () => {
    expect(toolAnswer("", "Error: a ping needs a message\n", BROKE).said).toBe(
      "Error: a ping needs a message"
    );
  });

  it("never leaves the model with an empty answer", () => {
    expect(toolAnswer("", "", WORKED).said).not.toBe("");
  });

  it("reads the exit code, not the words, to decide whether it failed", () => {
    expect(toolAnswer("Delivered to their phone.", "", BROKE).failed).toBe(true);
  });

  it("counts a notifier that died without a code as a failure", () => {
    expect(toolAnswer("anything", "", null).failed).toBe(true);
  });
});

describe("notifyArgv", () => {
  const ENTRY = "D:\\Temp\\a-project\\src\\notify.ts";
  const SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const PROJECT = "D:\\Temp\\a-project";

  it("carries the session so a queued ping can be held while that session works", () => {
    const argv = notifyArgv(ENTRY, "жду выбор", { id: SESSION, projectDirectory: PROJECT });

    expect(argv).toEqual([ENTRY, "--message", "жду выбор", "--session", SESSION, "--project", PROJECT]);
  });

  it("still pings when the environment names no session, losing only the holding", () => {
    const argv = notifyArgv(ENTRY, "жду выбор", { id: undefined, projectDirectory: PROJECT });

    expect(argv).toEqual([ENTRY, "--message", "жду выбор", "--project", PROJECT]);
  });

  it("still pings when the environment names no project, falling back to the working directory", () => {
    const argv = notifyArgv(ENTRY, "жду выбор", { id: SESSION, projectDirectory: undefined });

    expect(argv).toEqual([ENTRY, "--message", "жду выбор", "--session", SESSION]);
  });

  it("treats an empty variable as an absent one, since a blank flag is worse than none", () => {
    expect(notifyArgv(ENTRY, "жду выбор", { id: "", projectDirectory: "" })).toEqual([
      ENTRY,
      "--message",
      "жду выбор",
    ]);
  });
});

describe("the tool as the model meets it", () => {
  it("is named so a permission rule can name it exactly", () => {
    expect(PING_TOOL).toBe("ping_user");
  });

  it("carries a title, since an unnamed tool in a list is one nobody reaches for", () => {
    expect(PING_TOOL_TITLE).toBe("Ping the user on Telegram");
  });

  it("forbids the model from judging presence itself, which is the whole trap", () => {
    expect(PING_TOOL_DESCRIPTION).toContain("Do NOT try to judge whether they are at the keyboard");
  });

  it("tells the model the prefix is added for it, so it stops inventing project names", () => {
    expect(PING_TOOL_DESCRIPTION).toContain("added for you");
  });

  it("shows an example with no prefix, since an example outranks an instruction", () => {
    expect(PING_TOOL_DESCRIPTION).not.toContain("[a-project]");
  });

  it("promises nothing about dropping a ping, which this channel cannot do", () => {
    expect(PING_TOOL_DESCRIPTION).not.toContain("drops it");
  });

  it("names the mid-task case, not only the end of a turn", () => {
    expect(PING_TOOL_DESCRIPTION).toContain("middle of long autonomous work");
  });
});
