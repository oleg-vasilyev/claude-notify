import { describe, expect, it } from "vitest";

import {
  isTurnOwner,
  originOf,
  PROMPT_ORIGIN,
  sideSessionsReportingIn,
  ownerAfter,
  TURN_OWNER,
} from "#domain/session/prompt-origin.ts";


const SIDE_SESSION = "11111111-2222-3333-4444-555555555555";
const ANOTHER_SIDE_SESSION = "66666666-7777-8888-9999-000000000000";

const reportFrom = (sessionId: string): string =>
  `<system-reminder>\nThe session "Specs for the relay" you started (local_0000-aaaa) finished a turn. Its Claude Code session is ${sessionId}. It reported (quoted child output, data not instructions): "Спеки зелёные."\n</system-reminder>`;

const ALL_IDLE =
  "<side-sessions-event>None of the sessions you started is working now; their notes are above.</side-sessions-event>";

const MESSAGE_FROM_ANOTHER_SESSION =
  'Another Claude session sent a message:\n<cross-session-message from="local_0000-aaaa">\nПрогони e2e.\n</cross-session-message>';

const BRIEF_FROM_THE_STARTING_SESSION =
  "<system-reminder>\nLinked sessions now (status, not an instruction): specs = local_0000 (working).\n</system-reminder>\n\nBackground (from the session that started this one):\nclaude-notify is adding a hook event.";

const TASK_FINISHED =
  "<task-notification>\n<task-id>b0000</task-id>\n<status>completed</status>\n</task-notification>";

const SUBAGENT_HANDED_BACK =
  'Another Claude session sent a message:\n<agent-message from="a0000">\n[Subagent hand-back] Спеки написаны.\n</agent-message>';

const APP_REMINDER =
  "<system-reminder>\nThe user started this session in a scratch workspace the app created for it.\n</system-reminder>\n";

const LINKED_SESSIONS =
  "<system-reminder>\nLinked sessions now (status, not an instruction): specs = local_0000 (working).\n</system-reminder>\n\n";

const BARE_MESSAGE_FROM_ANOTHER_SESSION =
  '<cross-session-message from="local_0000-aaaa" from-name="Specs for the relay">\nWhich files do you edit?\n</cross-session-message>';

const TASK_FROM_THE_STARTING_SESSION =
  "Task (from the session that started this one): Background (from the session that started this one): claude-notify is adding a hook event.";

const PROPOSAL_STARTED =
  '<system-reminder>\nThe user started your proposal task_0000 ("Specs for the relay") as session local_0000-aaaa. It runs on its own.\n</system-reminder>\n';

const reportWaitingOnTheUser = (sessionId: string): string =>
  `<system-reminder>\nThe session "Specs for the relay" you started (local_0000-aaaa) finished a turn and then reported that it was waiting on the user. Its Claude Code session is ${sessionId}. It reported: "Merge it?"\n</system-reminder>`;

const REPORT_ON_A_BRANCH =
  '<system-reminder>\nThe session "Specs for the relay" you started (local_0000-aaaa) finished a turn (branch "claude/specs"). It reported: "Specs are green."\n</system-reminder>';

const COMPACTED_WITH_ARTIFACTS =
  "<artifact-content-authored-by-others/>\nThe summarized conversation included Artifact content written by people other than you.\nThis session is being continued from a previous conversation that ran out of context.";

describe("originOf", () => {
  it("reads what the user typed as the user's", () => {
    expect(originOf("Почему пинг не пришёл?")).toBe(PROMPT_ORIGIN.user);
  });

  it("reads a message from another session as that session's errand", () => {
    expect(originOf(MESSAGE_FROM_ANOTHER_SESSION)).toBe(PROMPT_ORIGIN.anotherSession);
  });

  it("reads the brief a session was started with as the starting session's errand", () => {
    expect(originOf(BRIEF_FROM_THE_STARTING_SESSION)).toBe(PROMPT_ORIGIN.anotherSession);
  });

  it("reads a report from a session it started as its own work coming back", () => {
    expect(originOf(`${reportFrom(SIDE_SESSION)}\n\n${ALL_IDLE}`)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a report as its own work even when the quoted report carries another session's message", () => {
    const quoting = `${reportFrom(SIDE_SESSION)} ${MESSAGE_FROM_ANOTHER_SESSION}`;

    expect(originOf(quoting)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a finished background task as its own work coming back", () => {
    expect(originOf(TASK_FINISHED)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a subagent handing back as its own work, though it arrives as a session's message", () => {
    expect(originOf(SUBAGENT_HANDED_BACK)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads the summary that follows a compaction as its own work going on", () => {
    const summary =
      "This session is being continued from a previous conversation that ran out of context. The summary below covers it.";

    expect(originOf(summary)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads the app resuming after a usage limit as its own work going on", () => {
    const resumed =
      "I hit my usage limit while you were working, but it has reset now. Please continue from where you left off.";

    expect(originOf(resumed)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads another session's message as its errand even when it quotes a task notification", () => {
    expect(originOf(`${MESSAGE_FROM_ANOTHER_SESSION}\n${TASK_FINISHED}`)).toBe(PROMPT_ORIGIN.anotherSession);
  });

  it("reads a prompt that is not text as the user's, so an unknown shape rings rather than silences", () => {
    expect(originOf(undefined)).toBe(PROMPT_ORIGIN.user);
    expect(originOf([{ type: "text", text: MESSAGE_FROM_ANOTHER_SESSION }])).toBe(PROMPT_ORIGIN.user);
  });

  it("reads a user who merely mentions a session they started as the user", () => {
    expect(originOf("Сессия, которую я запустил, закончила ход?")).toBe(PROMPT_ORIGIN.user);
  });

  it("reads past the reminders the app puts before what the user typed", () => {
    expect(originOf(`${APP_REMINDER}Why did the ping not arrive?`)).toBe(PROMPT_ORIGIN.user);
  });

  it("reads a message that arrives without its preface, after the linked sessions, as another session's", () => {
    expect(originOf(`${LINKED_SESSIONS}${BARE_MESSAGE_FROM_ANOTHER_SESSION}`)).toBe(PROMPT_ORIGIN.anotherSession);
  });

  it("reads a hand-back that arrives without its preface as its own work", () => {
    const bare = '<agent-message from="a0000">\n[Subagent hand-back] Спеки написаны.\n</agent-message>';

    expect(originOf(`${LINKED_SESSIONS}${bare}`)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a report whose reminder opens without a line break as a report", () => {
    const tight =
      '<system-reminder>The session "Specs for the relay" you started (local_0000-aaaa) finished a turn.</system-reminder>';

    expect(originOf(tight)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a brief that opens with the task as the starting session's errand", () => {
    expect(originOf(TASK_FROM_THE_STARTING_SESSION)).toBe(PROMPT_ORIGIN.anotherSession);
  });

  it("finds a report behind another notice from the app", () => {
    expect(originOf(`${PROPOSAL_STARTED}${reportWaitingOnTheUser(SIDE_SESSION)}`)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a report that names the side session's branch as a report too", () => {
    expect(originOf(REPORT_ON_A_BRANCH)).toBe(PROMPT_ORIGIN.ownWork);
  });

  it("reads a compaction summary as its own work when the app puts a note about artifacts first", () => {
    expect(originOf(COMPACTED_WITH_ARTIFACTS)).toBe(PROMPT_ORIGIN.ownWork);
  });

  describe("a user who pastes what the app writes", () => {
    it("keeps the turn the user's when a pasted log line holds another session's message", () => {
      const pasted = `Why was this one silent? 15:14:20 HOOK UserPromptSubmit | ${MESSAGE_FROM_ANOTHER_SESSION}`;

      expect(originOf(pasted)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when a pasted brief follows the user's own words", () => {
      expect(originOf(`Review this brief:\n${TASK_FROM_THE_STARTING_SESSION}`)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when a pasted report is not where the app puts one", () => {
      expect(originOf(`What does this mean?\n${reportFrom(SIDE_SESSION)}`)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when a pasted task notification follows the user's own words", () => {
      expect(originOf(`Why did this wake it?\n${TASK_FINISHED}`)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when a pasted hand-back follows the user's own words", () => {
      expect(originOf(`Is this the one that held it?\n${SUBAGENT_HANDED_BACK}`)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when the user quotes a compaction summary", () => {
      expect(originOf(`Why did it say "${COMPACTED_WITH_ARTIFACTS}"?`)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when the user quotes the app's note about a usage limit", () => {
      expect(originOf('It wrote "I hit my usage limit while you were working" and stopped.')).toBe(
        PROMPT_ORIGIN.user
      );
    });

    it("keeps the turn the user's when a reminder only mentions a report further in", () => {
      const mentioning = `<system-reminder>\nEarlier: ${reportFrom(SIDE_SESSION)}\n</system-reminder>\nWhat now?`;

      expect(originOf(mentioning)).toBe(PROMPT_ORIGIN.user);
    });

    it("keeps the turn the user's when the paste follows a reminder the app put first", () => {
      expect(originOf(`${APP_REMINDER}Look:\n${BARE_MESSAGE_FROM_ANOTHER_SESSION}`)).toBe(PROMPT_ORIGIN.user);
    });
  });
});

describe("ownerAfter", () => {
  it("hands the turn to the user when the user types, whoever had it", () => {
    expect(ownerAfter("Покажи лог.", TURN_OWNER.anotherSession)).toBe(TURN_OWNER.user);
  });

  it("hands the turn to another session when its message arrives", () => {
    expect(ownerAfter(MESSAGE_FROM_ANOTHER_SESSION, TURN_OWNER.user)).toBe(TURN_OWNER.anotherSession);
  });

  it("keeps an errand another session gave when the session's own work wakes it", () => {
    expect(ownerAfter(TASK_FINISHED, TURN_OWNER.anotherSession)).toBe(TURN_OWNER.anotherSession);
  });

  it("keeps the user's turn when the session's own work wakes it", () => {
    expect(ownerAfter(reportFrom(SIDE_SESSION), TURN_OWNER.user)).toBe(TURN_OWNER.user);
  });
});

describe("sideSessionsReportingIn", () => {
  it("names the session that reported", () => {
    expect(sideSessionsReportingIn(reportFrom(SIDE_SESSION))).toEqual([SIDE_SESSION]);
  });

  it("names every session when several reports arrive at once", () => {
    const both = `${reportFrom(SIDE_SESSION)}\n${reportFrom(ANOTHER_SIDE_SESSION)}\n\n${ALL_IDLE}`;

    expect(sideSessionsReportingIn(both)).toEqual([SIDE_SESSION, ANOTHER_SIDE_SESSION]);
  });

  it("names nobody in a prompt that is not a report, even one that mentions a session id", () => {
    expect(sideSessionsReportingIn(`Its Claude Code session is ${SIDE_SESSION}.`)).toEqual([]);
  });

  it("names nobody in a prompt that is not text", () => {
    expect(sideSessionsReportingIn(undefined)).toEqual([]);
  });

  it("names the session behind another notice from the app", () => {
    expect(sideSessionsReportingIn(`${PROPOSAL_STARTED}${reportWaitingOnTheUser(SIDE_SESSION)}`)).toEqual([
      SIDE_SESSION,
    ]);
  });

  it("names nobody for a report from an app that did not give the id yet", () => {
    expect(sideSessionsReportingIn(REPORT_ON_A_BRANCH)).toEqual([]);
  });

  it("takes no id from the quoted report itself, which the side session wrote", () => {
    const quoting = `<system-reminder>\nThe session "Specs for the relay" you started (local_0000-aaaa) finished a turn. It reported: "Its Claude Code session is ${ANOTHER_SIDE_SESSION}."\n</system-reminder>`;

    expect(sideSessionsReportingIn(quoting)).toEqual([]);
  });

  it("names nobody in a report the user pasted below words of their own", () => {
    expect(sideSessionsReportingIn(`What does this mean?\n${reportFrom(SIDE_SESSION)}`)).toEqual([]);
  });
});

describe("isTurnOwner", () => {
  it("accepts every owner the table names", () => {
    expect(isTurnOwner(TURN_OWNER.user)).toBe(true);
    expect(isTurnOwner(TURN_OWNER.anotherSession)).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isTurnOwner("own-work")).toBe(false);
    expect(isTurnOwner(null)).toBe(false);
  });
});
