import { beforeEach, describe, expect, it, vi } from "vitest";

import { idleSeconds } from "#presence/idle-time.ts";
import { forgetQuestion, readAnswer, writeAskedQuestion } from "#state/asked-question.ts";
import { readConfig, type Config } from "#state/config.ts";
import { log } from "#state/log.ts";
import { closeQuestion, sendQuestion } from "#telegram/telegram-api.ts";
import { ask } from "#app/ask.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


vi.mock("node:crypto", () => ({ randomUUID: () => "abc12345-0000-0000-0000-000000000000" }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("#state/config.ts", () => ({ readConfig: vi.fn() }));
vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#presence/idle-time.ts", () => ({ idleSeconds: vi.fn() }));
vi.mock("#state/asked-question.ts", () => ({
  writeAskedQuestion: vi.fn(),
  readAnswer: vi.fn(),
  forgetQuestion: vi.fn(),
}));
vi.mock("#telegram/telegram-api.ts", () => ({
  sendQuestion: vi.fn(),
  closeQuestion: vi.fn(),
}));
vi.mock("#app/watcher-process.ts", () => ({ startWatcher: vi.fn(), watcherIsRunning: vi.fn() }));

const AWAY_SECONDS = 600;
const PRESENT_SECONDS = 5;
const ID = "abc12345";
const A_STEP_MS = 30_000;
const A_MESSAGE = 77;

const config: Config = {
  token: "T",
  chatId: "42",
  machineLabel: "home",
  minIdleMinutes: 3,
  staleMinutes: 15,
  includeUsage: false,
  askMinutes: 10,
  quoteQuestions: true,
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

const runsOutOfTime = (): void => {
  let clock = Date.now();

  vi.spyOn(Date, "now").mockImplementation(() => {
    clock += A_STEP_MS;

    return clock;
  });
};

describe("ask", () => {
  beforeEach(() => {
    vi.mocked(readConfig).mockReturnValue(config);
    vi.mocked(idleSeconds).mockReturnValue(AWAY_SECONDS);
    vi.mocked(watcherIsRunning).mockReturnValue(false);
    vi.mocked(sendQuestion).mockResolvedValue(A_MESSAGE);
    vi.mocked(closeQuestion).mockResolvedValue(undefined);
    vi.mocked(readAnswer).mockReturnValue({ said: "Форк", chosenValue: "0", callbackId: null });
  });

  it("takes the keyboard away when the window closes unanswered", async () => {
    vi.mocked(readAnswer).mockReturnValue(null);
    runsOutOfTime();

    await ask("PreToolUse", payload);

    expect(closeQuestion).toHaveBeenCalledWith(
      "T",
      "42",
      A_MESSAGE,
      expect.stringContaining("вернулся в приложение")
    );
  });

  it("leaves an answered question for the watcher to close, so it is not closed twice", async () => {
    await ask("PreToolUse", payload);

    expect(closeQuestion).not.toHaveBeenCalled();
  });

  it("sends the question to Telegram with a button per option", async () => {
    await ask("PreToolUse", payload);

    expect(sendQuestion).toHaveBeenCalledWith("T", "42", expect.any(String), [
      { text: "★ Форк", data: `${ID}:0` },
      { text: "Та же", data: `${ID}:1` },
    ]);
  });

  it("labels the message with the project and the machine", async () => {
    await ask("PreToolUse", payload);

    expect(vi.mocked(sendQuestion).mock.calls[0]?.[2]).toContain("[job-finder@home]");
  });

  it("writes the question down before sending, so the watcher can match an answer", async () => {
    await ask("PreToolUse", payload);

    expect(writeAskedQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID }),
      A_MESSAGE,
      "[job-finder@home] Чем продолжим?"
    );
  });

  it("remembers which message carried the question, so its keyboard can be taken away", async () => {
    await ask("PreToolUse", payload);

    expect(vi.mocked(writeAskedQuestion).mock.calls[0]?.[1]).toBe(A_MESSAGE);
  });

  it("returns the answer as a decision the hook can print", async () => {
    const output = await ask("PreToolUse", payload);

    expect(output).toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
    });
  });

  it("forgets the question once it is answered", async () => {
    await ask("PreToolUse", payload);

    expect(forgetQuestion).toHaveBeenCalledWith(ID);
  });

  it("starts the watcher, since nobody else is reading Telegram", async () => {
    await ask("PreToolUse", payload);

    expect(startWatcher).toHaveBeenCalled();
  });

  it("leaves the watcher alone when it is already running", async () => {
    vi.mocked(watcherIsRunning).mockReturnValue(true);

    await ask("PreToolUse", payload);

    expect(startWatcher).not.toHaveBeenCalled();
  });

  it("says nothing while the user is at the keyboard", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    const output = await ask("PreToolUse", payload);

    expect(output).toBeNull();
    expect(sendQuestion).not.toHaveBeenCalled();
  });

  it("says nothing when answering from Telegram is turned off", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, askMinutes: 0 });

    const output = await ask("PreToolUse", payload);

    expect(output).toBeNull();
    expect(sendQuestion).not.toHaveBeenCalled();
  });

  it("says nothing for an event that carries no question", async () => {
    const output = await ask("Stop", { cwd: "D:\\Temp\\job-finder" });

    expect(output).toBeNull();
    expect(sendQuestion).not.toHaveBeenCalled();
  });

  it("says nothing when there is no configuration at all", async () => {
    vi.mocked(readConfig).mockReturnValue(null);

    expect(await ask("PreToolUse", payload)).toBeNull();
  });

  it("falls back to a plain ping when Telegram refuses the question", async () => {
    vi.mocked(sendQuestion).mockRejectedValue(new Error("429"));

    const output = await ask("PreToolUse", payload);

    expect(output).toBeNull();
  });

  it("writes nothing down for a question that was never delivered", async () => {
    vi.mocked(sendQuestion).mockRejectedValue(new Error("429"));

    await ask("PreToolUse", payload);

    expect(writeAskedQuestion).not.toHaveBeenCalled();
  });

  it("hands the question back to the app when the window closes unanswered", async () => {
    vi.mocked(readAnswer).mockReturnValue(null);
    runsOutOfTime();

    const output = await ask("PreToolUse", payload);

    expect(output).toEqual({});
  });

  it("forgets a question nobody answered, so it cannot be answered later by mistake", async () => {
    vi.mocked(readAnswer).mockReturnValue(null);
    runsOutOfTime();

    await ask("PreToolUse", payload);

    expect(forgetQuestion).toHaveBeenCalledWith(ID);
  });

  it("records the answer it acted on", async () => {
    await ask("PreToolUse", payload);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("ANSWERED"));
  });
});
