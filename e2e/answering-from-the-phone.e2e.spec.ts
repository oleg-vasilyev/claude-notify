import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startFakeTelegram, type FakeTelegram } from "./fake-telegram.ts";
import { runHook, type HookWorld } from "./hook-process.ts";


const CHAT = 4242;
const TOKEN = "424242:AAH-nothing-here-reaches-telegram";
const ALWAYS_AWAY = 0;
const A_MINUTE = 1;

const askedPayload = {
  cwd: "D:\\Temp\\job-finder",
  tool_name: "AskUserQuestion",
  tool_input: {
    questions: [
      {
        question: "Чем продолжим — форком или той же сессией?",
        options: [
          { label: "Форк", description: "Безопаснее. (Рекомендую)" },
          { label: "Та же сессия", description: "История в одном месте." },
        ],
      },
    ],
  },
};

const permissionPayload = {
  cwd: "D:\\Temp\\job-finder",
  tool_name: "Bash",
  tool_input: { command: "git push" },
};

describe("a question answered from the phone", () => {
  let telegram: FakeTelegram;
  let home: string;
  let world: HookWorld;

  beforeEach(async () => {
    telegram = await startFakeTelegram();
    home = mkdtempSync(join(tmpdir(), "claude-notify-e2e-"));

    const envFile = join(home, "settings.env");

    writeFileSync(
      envFile,
      [
        `BOT_TOKEN=${TOKEN}`,
        `CHAT_ID=${CHAT}`,
        "MACHINE_LABEL=home",
        `MIN_IDLE_MINUTES=${ALWAYS_AWAY}`,
        `ASK_MINUTES=${A_MINUTE}`,
        "INCLUDE_USAGE=false",
      ].join("\n"),
      "utf8"
    );

    world = { home, envFile, apiRoot: telegram.apiRoot };
  });

  afterEach(async () => {
    await telegram.stop();
    rmSync(home, { recursive: true, force: true });
  });

  it("puts the question on the phone with a button for every option", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[1]?.callback_data}`, CHAT);

    await running;

    expect(telegram.keyboard()).toEqual([
      { text: "★ Форк", callback_data: expect.stringMatching(/^[0-9a-f]{8}:0$/) },
      { text: "Та же сессия", callback_data: expect.stringMatching(/^[0-9a-f]{8}:1$/) },
    ]);
  });

  it("writes the question in Russian, naming the project and the machine", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[0]?.callback_data}`, CHAT);

    await running;

    expect(telegram.sentText()).toContain("[job-finder@home] Чем продолжим");
    expect(telegram.sentText()).toContain("Форк ← рекомендует");
  });

  it("hands the pressed option back to Claude Code as a decision", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[1]?.callback_data}`, CHAT);

    const finished = await running;

    expect(JSON.parse(finished.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("Та же сессия"),
      },
    });
  });

  it("carries words typed instead of a press, so an answer is not limited to the options", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.write("ни то ни другое — сначала прогони тесты", CHAT);

    const finished = await running;

    expect(finished.stdout).toContain("ни то ни другое — сначала прогони тесты");
  });

  it("survives a Cyrillic question arriving as bytes on stdin", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[0]?.callback_data}`, CHAT);

    await running;

    expect(telegram.sentText()).not.toContain("╨");
  });

  it("acknowledges the press so the button stops spinning", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[0]?.callback_data}`, CHAT);

    await running;
    await telegram.whenAcknowledged();

    expect(telegram.answered()).toBe(true);
  });

  it("asks to allow or deny when a tool wants a permission", async () => {
    const running = runHook("PermissionRequest", permissionPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[0]?.callback_data}`, CHAT);

    const finished = await running;

    expect(telegram.sentText()).toContain("просит разрешение: Bash");
    expect(JSON.parse(finished.stdout)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "allow" },
    });
  });

  it("denies the tool when the deny button is pressed", async () => {
    const running = runHook("PermissionRequest", permissionPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[1]?.callback_data}`, CHAT);

    const finished = await running;

    expect(JSON.parse(finished.stdout)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
  });

  it("ignores a press from somebody else's chat", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();
    telegram.press(`${telegram.keyboard()[0]?.callback_data}`, CHAT + 1);

    const finished = await running;

    expect(finished.stdout).toBe("");
  }, 90_000);

  it("says nothing to Claude Code when nobody answers in time", async () => {
    const running = runHook("PreToolUse", askedPayload, world);

    await telegram.whenAsked();

    const finished = await running;

    expect(finished.stdout).toBe("");
    expect(finished.code).toBe(0);
  }, 90_000);
});
