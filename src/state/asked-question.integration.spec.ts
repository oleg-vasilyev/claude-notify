import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AskedQuestion } from "#domain/asking/question.ts";
import {
  forgetQuestion,
  readAnswer,
  readAskedQuestions,
  writeAnswer,
  writeAskedQuestion,
} from "#state/asked-question.ts";
import { readUpdateOffset, writeUpdateOffset } from "#state/update-offset.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-asked-"));
});

vi.mock("#state/file-locations.ts", () => ({
  stateHome: () => state,
  askedQuestionFile: (id: string) => join(state, `question-${id}.json`),
  answerFile: (id: string) => join(state, `answer-${id}.json`),
  updateOffsetFile: () => join(state, "update-offset.txt"),
}));

const AN_OFFSET = 51;
const A_MESSAGE = 77;
const HEADLINE = "[a-project@home] Чем продолжим?";

const question: AskedQuestion = {
  id: "abc12345",
  kind: "choice",
  text: "Чем продолжим?",
  options: [{ value: "0", label: "Форк", recommended: true }],
};

const stored = { ...question, messageId: A_MESSAGE, headline: HEADLINE };

const answer = { said: "Форк", chosenValue: "0", callbackId: "cb1" };

describe("the question a hook is waiting on", () => {
  beforeEach(() => {
    for (const name of readdirSync(state)) {
      rmSync(join(state, name), { force: true });
    }
  });

  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("is readable by the other process that has to match it", () => {
    writeAskedQuestion(question, A_MESSAGE, HEADLINE);

    expect(readAskedQuestions()).toEqual([stored]);
  });

  it("lists every question waiting at once, since two projects can ask together", () => {
    writeAskedQuestion(question, A_MESSAGE, HEADLINE);
    writeAskedQuestion({ ...question, id: "other999" }, A_MESSAGE, HEADLINE);

    expect(readAskedQuestions()).toHaveLength(2);
  });

  it("reports nothing waiting before anything was asked", () => {
    expect(readAskedQuestions()).toEqual([]);
  });

  it("carries an answer back to the hook", () => {
    writeAnswer(question.id, answer);

    expect(readAnswer(question.id)).toEqual(answer);
  });

  it("has no answer for a question nobody replied to", () => {
    expect(readAnswer(question.id)).toBeNull();
  });

  it("forgets both halves, so a stale answer cannot resolve a later question", () => {
    writeAskedQuestion(question, A_MESSAGE, HEADLINE);
    writeAnswer(question.id, answer);

    forgetQuestion(question.id);

    expect(readAskedQuestions()).toEqual([]);
    expect(readAnswer(question.id)).toBeNull();
  });

  it("skips a half-written question rather than losing the others", () => {
    writeAskedQuestion(question, A_MESSAGE, HEADLINE);
    writeFileSync(join(state, "question-broken1.json"), '{"id":', "utf8");

    expect(readAskedQuestions()).toEqual([stored]);
  });

  it("treats a half-written answer as no answer at all", () => {
    writeFileSync(join(state, `answer-${question.id}.json`), '{"said":', "utf8");

    expect(readAnswer(question.id)).toBeNull();
  });

  it("ignores the other files sharing the state directory", () => {
    writeAskedQuestion(question, A_MESSAGE, HEADLINE);
    writeFileSync(join(state, "pending.jsonl"), "{}", "utf8");
    writeFileSync(join(state, "last-sent-a-project.txt"), "1", "utf8");

    expect(readAskedQuestions()).toEqual([stored]);
  });

  it("remembers how far it has read Telegram", () => {
    writeUpdateOffset(AN_OFFSET);

    expect(readUpdateOffset()).toBe(AN_OFFSET);
  });

  it("has read nothing before the first poll", () => {
    expect(readUpdateOffset()).toBeNull();
  });

  it("treats a corrupted offset as never having read, rather than as zero", () => {
    writeFileSync(join(state, "update-offset.txt"), "not a number", "utf8");

    expect(readUpdateOffset()).toBeNull();
  });
});
