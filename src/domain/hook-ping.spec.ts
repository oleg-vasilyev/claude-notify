import { describe, expect, it } from "vitest";

import { isHookEvent, pingFor, type HookPayload } from "#domain/hook-ping.ts";


const inProject: HookPayload = { cwd: "D:\\Temp\\FoolProof" };

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
    expect(pingFor("Stop", inProject).message).toBe("[FoolProof] закончил ход, ждёт тебя");
  });

  it("rate-limits the turn-end fallback so a burst collapses", () => {
    expect(pingFor("Stop", inProject).rateLimitMinutes).toBe(10);
  });

  it("quotes the question itself", () => {
    const payload: HookPayload = {
      ...inProject,
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Каким делать репозиторий?" }] },
    };

    expect(pingFor("PreToolUse", payload).message).toBe(
      "[FoolProof] вопрос: Каким делать репозиторий?"
    );
  });

  it("lets a question through sooner than a fallback, because it is worth more", () => {
    expect(pingFor("PreToolUse", inProject).rateLimitMinutes).toBe(2);
  });

  it("shortens a question that would not fit a notification", () => {
    const payload: HookPayload = {
      ...inProject,
      tool_input: { questions: [{ question: "я".repeat(400) }] },
    };

    const { message } = pingFor("PreToolUse", payload);

    expect(message.length).toBeLessThanOrEqual("[FoolProof] ".length + 180);
    expect(message.endsWith("…")).toBe(true);
  });

  it("leaves a question that just fits unshortened", () => {
    const asked = "я".repeat(180 - "вопрос: ".length);
    const payload: HookPayload = { ...inProject, tool_input: { questions: [{ question: asked }] } };

    expect(pingFor("PreToolUse", payload).message.endsWith("…")).toBe(false);
  });

  it("announces a plan waiting for approval", () => {
    const payload: HookPayload = { ...inProject, tool_name: "ExitPlanMode" };

    expect(pingFor("PreToolUse", payload).message).toBe("[FoolProof] план готов, жду апрув");
  });

  it("falls back when a question tool carried no question", () => {
    const payload: HookPayload = { ...inProject, tool_input: { questions: [] } };

    expect(pingFor("PreToolUse", payload).message).toBe("[FoolProof] ждёт твоего ответа");
  });

  it("names the tool asking for permission", () => {
    const payload: HookPayload = { ...inProject, tool_name: "Bash" };

    expect(pingFor("PermissionRequest", payload).message).toBe(
      "[FoolProof] просит разрешение: Bash"
    );
  });

  it("still says something when the permission payload named no tool", () => {
    expect(pingFor("PermissionRequest", inProject).message).toBe(
      "[FoolProof] просит разрешение: инструмент"
    );
  });

  it("passes through what a notification says", () => {
    const payload: HookPayload = { ...inProject, message: "нужно решение" };

    expect(pingFor("Notification", payload).message).toBe("[FoolProof] нужно решение");
  });

  it("works without a working directory, which is all a payload really guarantees", () => {
    expect(pingFor("Stop", {}).message).toBe("закончил ход, ждёт тебя");
  });
});
