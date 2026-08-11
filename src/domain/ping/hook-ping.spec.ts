import { describe, expect, it } from "vitest";

import { isHookEvent, pingFor, stillWorking, type HookPayload } from "#domain/ping/hook-ping.ts";


const inProject: HookPayload = { cwd: "D:\\Temp\\another-project" };
const QUOTING = true;
const KEEPING_IT_HERE = false;

const asked: HookPayload = {
  ...inProject,
  tool_name: "AskUserQuestion",
  tool_input: { questions: [{ question: "Каким делать репозиторий?" }] },
};

describe("isHookEvent", () => {
  it("accepts an event the installer registers", () => {
    expect(isHookEvent("PermissionRequest")).toBe(true);
  });

  it("rejects anything else, so a typo in a hook registration cannot ping nonsense", () => {
    expect(isHookEvent("Whatever")).toBe(false);
  });
});

describe("pingFor", () => {
  it("says the turn ended", () => {
    expect(pingFor("Stop", inProject, QUOTING).message).toBe("[another-project] закончил ход, ждёт тебя");
  });

  it("rate-limits the turn-end fallback so a burst collapses", () => {
    expect(pingFor("Stop", inProject, QUOTING).rateLimitMinutes).toBe(10);
  });

  it("quotes the question itself", () => {
    const payload: HookPayload = {
      ...inProject,
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Каким делать репозиторий?" }] },
    };

    expect(pingFor("PreToolUse", payload, QUOTING).message).toBe(
      "[another-project] вопрос: Каким делать репозиторий?"
    );
  });

  it("lets a question through sooner than a fallback, because it is worth more", () => {
    expect(pingFor("PreToolUse", inProject, QUOTING).rateLimitMinutes).toBe(2);
  });

  it("shortens a question that would not fit a notification", () => {
    const payload: HookPayload = {
      ...inProject,
      tool_input: { questions: [{ question: "я".repeat(400) }] },
    };

    const { message } = pingFor("PreToolUse", payload, QUOTING);

    expect(message.length).toBeLessThanOrEqual("[another-project] ".length + 180);
    expect(message.endsWith("…")).toBe(true);
  });

  it("leaves a question that just fits unshortened", () => {
    const asked = "я".repeat(180 - "вопрос: ".length);
    const payload: HookPayload = { ...inProject, tool_input: { questions: [{ question: asked }] } };

    expect(pingFor("PreToolUse", payload, QUOTING).message.endsWith("…")).toBe(false);
  });

  it("announces a plan waiting for approval", () => {
    const payload: HookPayload = { ...inProject, tool_name: "ExitPlanMode" };

    expect(pingFor("PreToolUse", payload, QUOTING).message).toBe("[another-project] план готов, жду апрув");
  });

  it("falls back when a question tool carried no question", () => {
    const payload: HookPayload = { ...inProject, tool_input: { questions: [] } };

    expect(pingFor("PreToolUse", payload, QUOTING).message).toBe("[another-project] ждёт твоего ответа");
  });

  it("names the tool asking for permission", () => {
    const payload: HookPayload = { ...inProject, tool_name: "Bash" };

    expect(pingFor("PermissionRequest", payload, QUOTING).message).toBe(
      "[another-project] просит разрешение: Bash"
    );
  });

  it("still says something when the permission payload named no tool", () => {
    expect(pingFor("PermissionRequest", inProject, QUOTING).message).toBe(
      "[another-project] просит разрешение: инструмент"
    );
  });

  it("passes through what a notification says", () => {
    const payload: HookPayload = { ...inProject, message: "нужно решение" };

    expect(pingFor("Notification", payload, QUOTING).message).toBe("[another-project] нужно решение");
  });

  it("works without a working directory, which is all a payload really guarantees", () => {
    expect(pingFor("Stop", {}, QUOTING).message).toBe("закончил ход, ждёт тебя");
  });

  it("keeps the question to itself on a machine that does not quote", () => {
    expect(pingFor("PreToolUse", asked, KEEPING_IT_HERE).message).toBe(
      "[another-project] ждёт твоего ответа"
    );
  });

  it("still announces a waiting plan when not quoting, since that names nothing", () => {
    const payload: HookPayload = { ...inProject, tool_name: "ExitPlanMode" };

    expect(pingFor("PreToolUse", payload, KEEPING_IT_HERE).message).toBe(
      "[another-project] план готов, жду апрув"
    );
  });

  it("still names the tool wanting a permission, which carries no work of its own", () => {
    const payload: HookPayload = { ...inProject, tool_name: "Bash" };

    expect(pingFor("PermissionRequest", payload, KEEPING_IT_HERE).message).toBe(
      "[another-project] просит разрешение: Bash"
    );
  });

  it("says the turn ended whether or not it quotes", () => {
    expect(pingFor("Stop", inProject, KEEPING_IT_HERE).message).toBe(
      "[another-project] закончил ход, ждёт тебя"
    );
  });
});

describe("stillWorking", () => {
  it("is true when the turn ended while a background task is still running", () => {
    expect(stillWorking("Stop", { background_tasks: [{}] })).toBe(true);
  });

  it("is false once nothing is running, which is the turn that really waits on the user", () => {
    expect(stillWorking("Stop", { background_tasks: [] })).toBe(false);
  });

  it("is false for a payload that never mentioned background work", () => {
    expect(stillWorking("Stop", {})).toBe(false);
  });

  it("counts every running task, not just the first", () => {
    expect(stillWorking("Stop", { background_tasks: [{}, {}, {}] })).toBe(true);
  });

  it("says nothing about a question, which waits on the user whatever else is running", () => {
    expect(stillWorking("PreToolUse", { background_tasks: [{}] })).toBe(false);
  });

  it("says nothing about a permission, for the same reason", () => {
    expect(stillWorking("PermissionRequest", { background_tasks: [{}] })).toBe(false);
  });
});
