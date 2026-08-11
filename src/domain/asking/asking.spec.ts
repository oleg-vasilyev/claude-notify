import { describe, expect, it } from "vitest";

import { decideAsk, type AskFacts } from "#domain/asking/asking.ts";


const ID = "abc12345";
const MIN_IDLE_MINUTES = 3;
const AWAY_SECONDS = 600;
const AT_THE_KEYBOARD_SECONDS = 5;
const EXACTLY_AWAY_SECONDS = 180;

const facts = (over: Partial<AskFacts> = {}): AskFacts => ({
  event: "PreToolUse",
  payload: {
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Чем продолжим?", options: [{ label: "Форк" }] }] },
  },
  id: ID,
  idleSeconds: AWAY_SECONDS,
  minIdleMinutes: MIN_IDLE_MINUTES,
  askEnabled: true,
  quoting: true,
  ...over,
});

const permissionWanted: Partial<AskFacts> = {
  event: "PermissionRequest",
  payload: { tool_name: "Bash" },
};

describe("decideAsk", () => {
  it("asks when the user is away and the question can be put in a message", () => {
    const verdict = decideAsk(facts());

    expect(verdict).toEqual({
      kind: "ask",
      question: {
        id: ID,
        kind: "choice",
        text: "Чем продолжим?",
        options: [{ value: "0", label: "Форк", recommended: false }],
      },
    });
  });

  it("stays out of the way while the user is at the keyboard", () => {
    const verdict = decideAsk(facts({ idleSeconds: AT_THE_KEYBOARD_SECONDS }));

    expect(verdict).toEqual({ kind: "present", idleSeconds: AT_THE_KEYBOARD_SECONDS });
  });

  it("counts the threshold itself as away, matching how a ping is delivered", () => {
    const verdict = decideAsk(facts({ idleSeconds: EXACTLY_AWAY_SECONDS }));

    expect(verdict.kind).toBe("ask");
  });

  it("never asks when answering is turned off, however long the user has been away", () => {
    const verdict = decideAsk(facts({ askEnabled: false }));

    expect(verdict).toEqual({ kind: "unaskable" });
  });

  it("checks that answering is on before looking at presence", () => {
    const verdict = decideAsk(
      facts({ askEnabled: false, idleSeconds: AT_THE_KEYBOARD_SECONDS })
    );

    expect(verdict).toEqual({ kind: "unaskable" });
  });

  it("falls back to a plain ping for an event that carries no question", () => {
    const verdict = decideAsk(facts({ event: "Stop", payload: {} }));

    expect(verdict).toEqual({ kind: "unaskable" });
  });

  it("never asks a question on a machine that does not quote, since asking means sending it", () => {
    const verdict = decideAsk(facts({ quoting: false }));

    expect(verdict).toEqual({ kind: "unaskable" });
  });

  it("still asks for a permission there, which names a tool and no work of its own", () => {
    const verdict = decideAsk(facts({ ...permissionWanted, quoting: false }));

    expect(verdict.kind).toBe("ask");
  });

  it("asks for a permission the same way when quoting is on", () => {
    const verdict = decideAsk(facts(permissionWanted));

    expect(verdict.kind).toBe("ask");
  });
});
