import { describe, expect, it } from "vitest";

import type { HookPayload } from "#domain/hook-ping.ts";
import { ALLOW, DENY, ownsAskUserQuestion, questionFrom, questionText } from "#domain/question.ts";


const ID = "abc12345";
const LONGER_THAN_ALLOWED = 700;
const LONGEST_ASKED = 500;
const LONGEST_LABEL = 60;

const asked = (options: { label?: string; description?: string }[]): HookPayload => ({
  tool_name: "AskUserQuestion",
  tool_input: { questions: [{ question: "Чем продолжим?", options }] },
});

describe("questionFrom", () => {
  it("turns a question with options into a choice", () => {
    const question = questionFrom("PreToolUse", asked([{ label: "Форк" }, { label: "Та же" }]), ID);

    expect(question).toEqual({
      id: ID,
      kind: "choice",
      text: "Чем продолжим?",
      options: [
        { value: "0", label: "Форк", recommended: false },
        { value: "1", label: "Та же", recommended: false },
      ],
    });
  });

  it("marks the option whose description recommends it", () => {
    const question = questionFrom(
      "PreToolUse",
      asked([{ label: "Форк", description: "Безопаснее. (Рекомендую)" }, { label: "Та же" }]),
      ID
    );

    expect(question?.options[0]?.recommended).toBe(true);
  });

  it("marks a recommendation written in English too", () => {
    const question = questionFrom(
      "PreToolUse",
      asked([{ label: "Fork", description: "Safer. (Recommended)" }]),
      ID
    );

    expect(question?.options[0]?.recommended).toBe(true);
  });

  it("does not mark an option that merely mentions a recommendation elsewhere", () => {
    const question = questionFrom(
      "PreToolUse",
      asked([{ label: "Форк", description: "Я это не рекомендую делать" }]),
      ID
    );

    expect(question?.options[0]?.recommended).toBe(false);
  });

  it("drops an option with no label rather than showing a blank button", () => {
    const question = questionFrom("PreToolUse", asked([{ label: "" }, { label: "Та же" }]), ID);

    expect(question?.options).toEqual([{ value: "1", label: "Та же", recommended: false }]);
  });

  it("keeps the original index as the value, so a dropped option cannot shift the answer", () => {
    const question = questionFrom(
      "PreToolUse",
      asked([{ label: "" }, { label: "Второй" }, { label: "Третий" }]),
      ID
    );

    expect(question?.options.map((option) => option.value)).toEqual(["1", "2"]);
  });

  it("shortens a question too long for a message", () => {
    const payload = asked([{ label: "Да" }]);
    const longest = { ...payload, tool_input: { questions: [{ question: "я".repeat(LONGER_THAN_ALLOWED), options: [{ label: "Да" }] }] } };

    expect(questionFrom("PreToolUse", longest, ID)?.text).toHaveLength(LONGEST_ASKED);
  });

  it("shortens a label too long for a button", () => {
    const question = questionFrom("PreToolUse", asked([{ label: "д".repeat(LONGER_THAN_ALLOWED) }]), ID);

    expect(question?.options[0]?.label).toHaveLength(LONGEST_LABEL);
  });

  it("refuses a question with no options, because there would be nothing to press", () => {
    expect(questionFrom("PreToolUse", asked([]), ID)).toBeNull();
  });

  it("refuses a question with no text", () => {
    const payload: HookPayload = {
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "", options: [{ label: "Да" }] }] },
    };

    expect(questionFrom("PreToolUse", payload, ID)).toBeNull();
  });

  it("leaves ExitPlanMode alone, since a plan does not fit in a message", () => {
    expect(questionFrom("PreToolUse", { tool_name: "ExitPlanMode" }, ID)).toBeNull();
  });

  it("turns a permission request into an allow-or-deny question", () => {
    const question = questionFrom("PermissionRequest", { tool_name: "Bash" }, ID);

    expect(question).toEqual({
      id: ID,
      kind: "permission",
      text: "просит разрешение: Bash",
      options: [
        { value: ALLOW, label: "Разрешить", recommended: false },
        { value: DENY, label: "Запретить", recommended: false },
      ],
    });
  });

  it("names the tool generically when the payload did not say which", () => {
    expect(questionFrom("PermissionRequest", {}, ID)?.text).toBe("просит разрешение: инструмент");
  });

  it("ignores a PermissionRequest for AskUserQuestion, which PreToolUse already owns", () => {
    expect(questionFrom("PermissionRequest", asked([{ label: "Да" }]), ID)).toBeNull();
  });

  it("has nothing to ask on a finished turn", () => {
    expect(questionFrom("Stop", {}, ID)).toBeNull();
  });

  it("has nothing to ask on a notification", () => {
    expect(questionFrom("Notification", { message: "жду" }, ID)).toBeNull();
  });
});

describe("ownsAskUserQuestion", () => {
  it("is true only for the PreToolUse that precedes the tool", () => {
    expect(ownsAskUserQuestion("PreToolUse", { tool_name: "AskUserQuestion" })).toBe(true);
  });

  it("is false for the permission request that fires at the same moment", () => {
    expect(ownsAskUserQuestion("PermissionRequest", { tool_name: "AskUserQuestion" })).toBe(false);
  });

  it("is false for another tool", () => {
    expect(ownsAskUserQuestion("PreToolUse", { tool_name: "ExitPlanMode" })).toBe(false);
  });
});

describe("questionText", () => {
  it("lists the options under the question and points at the recommended one", () => {
    const question = questionFrom(
      "PreToolUse",
      asked([{ label: "Форк", description: "(Рекомендую)" }, { label: "Та же" }]),
      ID
    );

    expect(questionText(question!, "[t-claude] ")).toBe(
      "[t-claude] Чем продолжим?\n\n• Форк ← рекомендует\n• Та же\n\nНажми кнопку или ответь сообщением своими словами."
    );
  });

  it("leaves a permission question bare, since its two buttons say everything", () => {
    const question = questionFrom("PermissionRequest", { tool_name: "Bash" }, ID);

    expect(questionText(question!, "[t-claude] ")).toBe("[t-claude] просит разрешение: Bash");
  });
});
