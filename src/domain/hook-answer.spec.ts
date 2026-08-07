import { describe, expect, it } from "vitest";

import type { ReceivedAnswer } from "#domain/answer.ts";
import { hookAnswerOutput } from "#domain/hook-answer.ts";
import { ALLOW, DENY, type AskedQuestion } from "#domain/question.ts";


const HANDED_BACK = {};

const choice: AskedQuestion = {
  id: "abc12345",
  kind: "choice",
  text: "Чем продолжим?",
  options: [
    { value: "0", label: "Форк", recommended: true },
    { value: "1", label: "Та же", recommended: false },
  ],
};

const permission: AskedQuestion = {
  id: "abc12345",
  kind: "permission",
  text: "просит разрешение: Bash",
  options: [
    { value: ALLOW, label: "Разрешить", recommended: false },
    { value: DENY, label: "Запретить", recommended: false },
  ],
};

const answer = (over: Partial<ReceivedAnswer> = {}): ReceivedAnswer => ({
  said: "Форк",
  chosenValue: "0",
  callbackId: null,
  ...over,
});

describe("hookAnswerOutput", () => {
  it("hands the question back to the app when nobody answered", () => {
    expect(hookAnswerOutput("PreToolUse", choice, null)).toEqual(HANDED_BACK);
  });

  it("carries the chosen option back as the answer", () => {
    const output = hookAnswerOutput("PreToolUse", choice, answer());

    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Пользователь ответил из Telegram: «Форк». Это и есть ответ на твой вопрос — прими его и продолжай, не задавая вопрос снова.",
      },
    });
  });

  it("carries words the user wrote instead of pressing", () => {
    const output = hookAnswerOutput("PreToolUse", choice, answer({ said: "сделай третье", chosenValue: null }));

    expect(JSON.stringify(output)).toContain("сделай третье");
  });

  it("tells the model not to ask again, which is what a bare denial would invite", () => {
    const output = hookAnswerOutput("PreToolUse", choice, answer());

    expect(JSON.stringify(output)).toContain("не задавая вопрос снова");
  });

  it("allows the tool when the allow button was pressed", () => {
    const output = hookAnswerOutput("PermissionRequest", permission, answer({ said: "Разрешить", chosenValue: ALLOW }));

    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        permissionDecision: "allow",
        permissionDecisionReason: "Пользователь ответил из Telegram: «Разрешить».",
      },
    });
  });

  it("denies the tool when the deny button was pressed", () => {
    const output = hookAnswerOutput("PermissionRequest", permission, answer({ said: "Запретить", chosenValue: DENY }));

    expect(output).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
  });

  it("hands a permission back rather than guessing when the answer was not a button", () => {
    const output = hookAnswerOutput("PermissionRequest", permission, answer({ said: "ну давай", chosenValue: null }));

    expect(output).toEqual(HANDED_BACK);
  });

  it("hands a permission back when it went unanswered", () => {
    expect(hookAnswerOutput("PermissionRequest", permission, null)).toEqual(HANDED_BACK);
  });

  it("names the event it is answering, so the host can tell the two hooks apart", () => {
    const output = hookAnswerOutput("PermissionRequest", choice, answer());

    expect(output).toMatchObject({ hookSpecificOutput: { hookEventName: "PermissionRequest" } });
  });
});
