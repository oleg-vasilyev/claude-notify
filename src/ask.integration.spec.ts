import { rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { idleSeconds } from "#presence/idle-time.ts";
import { readAskedQuestions } from "#state/asked-question.ts";
import { readConfig, type Config, type TelegramDelivery } from "#state/config.ts";
import { collectAnswers } from "#app/answering.ts";
import { ask } from "#app/ask.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-ask-"));
});

vi.mock("#state/file-locations.ts", () => ({
  stateHome: () => state,
  askedQuestionFile: (id: string) => join(state, `question-${id}.json`),
  answerFile: (id: string) => join(state, `answer-${id}.json`),
  updateOffsetFile: () => join(state, "update-offset.txt"),
}));

vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#state/config.ts", () => ({ readConfig: vi.fn() }));
vi.mock("#presence/idle-time.ts", () => ({ idleSeconds: vi.fn() }));
vi.mock("#app/watcher-process.ts", () => ({
  startWatcher: vi.fn(),
  watcherIsRunning: () => true,
}));

const AWAY_SECONDS = 600;
const NO_LONG_POLL = 0;
const A_MOMENT_MS = 20;
const GIVING_UP_AFTER_MS = 5000;
const AN_UPDATE = 31;
const CHAT = 42;
const A_SHORT_WINDOW_MINUTES = 0.05;

const delivery: TelegramDelivery = { kind: "telegram", token: "T", chatId: `${CHAT}` };

const config: Config = {
  delivery,
  machineLabel: "home",
  minIdleMinutes: 3,
  staleMinutes: 15,
  includeUsage: false,
  askMinutes: 1,
  quoteQuestions: true,
  relaySecret: "",
  relayPort: 8787,
};

const payload = {
  cwd: "D:\\Temp\\job-finder",
  tool_name: "AskUserQuestion",
  tool_input: {
    questions: [
      {
        question: "Чем продолжим?",
        options: [{ label: "Форк", description: "(Рекомендую)" }, { label: "Та же" }],
      },
    ],
  },
};

const sent: { url: string; body: unknown }[] = [];
let waitingInTelegram: unknown[] = [];

const telegram = async (url: string | URL, options?: RequestInit): Promise<Response> => {
  const address = `${url}`;
  const body = options?.body === undefined ? null : JSON.parse(`${options.body}`);

  sent.push({ url: address, body });

  if (address.includes("/getUpdates")) {
    return new Response(JSON.stringify({ result: waitingInTelegram }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const pressOf = (questionId: string, value: string): unknown => ({
  update_id: AN_UPDATE,
  callback_query: {
    id: "cb1",
    data: `${questionId}:${value}`,
    message: { chat: { id: CHAT } },
  },
});

const untilAsked = async (): Promise<string> => {
  const deadline = Date.now() + GIVING_UP_AFTER_MS;

  while (Date.now() < deadline) {
    const asked = readAskedQuestions()[0];

    if (asked !== undefined) {
      return asked.id;
    }

    await sleep(A_MOMENT_MS);
  }

  throw new Error("the question was never written down");
};

describe("a question answered from Telegram", () => {
  beforeEach(() => {
    sent.length = 0;
    waitingInTelegram = [];
    vi.mocked(readConfig).mockReturnValue(config);
    vi.mocked(idleSeconds).mockReturnValue(AWAY_SECONDS);
    vi.stubGlobal("fetch", telegram);

    for (const question of readAskedQuestions()) {
      rmSync(join(state, `question-${question.id}.json`), { force: true });
      rmSync(join(state, `answer-${question.id}.json`), { force: true });
    }

    rmSync(join(state, "update-offset.txt"), { force: true });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    rmSync(state, { recursive: true, force: true });
  });

  it("carries a pressed button all the way back to the hook's decision", async () => {
    const asking = ask("PreToolUse", payload);
    const id = await untilAsked();

    waitingInTelegram = [pressOf(id, "1")];

    await collectAnswers(delivery, NO_LONG_POLL);

    await expect(asking).resolves.toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
  });

  it("names the option the user actually pressed", async () => {
    const asking = ask("PreToolUse", payload);
    const id = await untilAsked();

    waitingInTelegram = [pressOf(id, "1")];

    await collectAnswers(delivery, NO_LONG_POLL);

    expect(JSON.stringify(await asking)).toContain("Та же");
  });

  it("sends a real Telegram message carrying the buttons", async () => {
    const asking = ask("PreToolUse", payload);
    const id = await untilAsked();

    waitingInTelegram = [pressOf(id, "0")];

    await collectAnswers(delivery, NO_LONG_POLL);
    await asking;

    const question = sent.find((call) => call.url.includes("/sendMessage"));

    expect(question?.body).toMatchObject({
      chat_id: `${CHAT}`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "★ Форк", callback_data: `${id}:0` }],
          [{ text: "Та же", callback_data: `${id}:1` }],
        ],
      },
    });
  });

  it("acknowledges the press so the phone stops spinning", async () => {
    const asking = ask("PreToolUse", payload);
    const id = await untilAsked();

    waitingInTelegram = [pressOf(id, "0")];

    await collectAnswers(delivery, NO_LONG_POLL);
    await asking;

    expect(sent.some((call) => call.url.includes("/answerCallbackQuery"))).toBe(true);
  });

  it("leaves no question behind once it has been answered", async () => {
    const asking = ask("PreToolUse", payload);
    const id = await untilAsked();

    waitingInTelegram = [pressOf(id, "0")];

    await collectAnswers(delivery, NO_LONG_POLL);
    await asking;

    expect(readAskedQuestions()).toEqual([]);
  });

  it("ignores a press from a chat that is not the configured one", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, askMinutes: A_SHORT_WINDOW_MINUTES });

    const asking = ask("PreToolUse", payload);
    const id = await untilAsked();

    waitingInTelegram = [
      {
        update_id: AN_UPDATE,
        callback_query: {
          id: "cb1",
          data: `${id}:0`,
          message: { chat: { id: CHAT + 1 } },
        },
      },
    ];

    await collectAnswers(delivery, NO_LONG_POLL);

    await expect(asking).resolves.toEqual({});
  });
});
