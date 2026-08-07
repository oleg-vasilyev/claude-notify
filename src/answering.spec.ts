import { beforeEach, describe, expect, it, vi } from "vitest";

import { readAskedQuestions, writeAnswer } from "#state/asked-question.ts";
import type { Config } from "#state/config.ts";
import { log } from "#state/log.ts";
import { readUpdateOffset, writeUpdateOffset } from "#state/update-offset.ts";
import { answerCallback, closeQuestion, fetchUpdates } from "#telegram/telegram-api.ts";
import { collectAnswers } from "#app/answering.ts";


vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#state/asked-question.ts", () => ({
  readAskedQuestions: vi.fn(),
  writeAnswer: vi.fn(),
}));
vi.mock("#state/update-offset.ts", () => ({
  readUpdateOffset: vi.fn(),
  writeUpdateOffset: vi.fn(),
}));
vi.mock("#telegram/telegram-api.ts", () => ({
  fetchUpdates: vi.fn(),
  answerCallback: vi.fn(),
  closeQuestion: vi.fn(),
}));

const LONG_POLL_SECONDS = 25;
const AN_UPDATE = 11;
const LAST_SEEN = 4;

const config: Config = {
  token: "T",
  chatId: "42",
  machineLabel: "home",
  minIdleMinutes: 3,
  staleMinutes: 15,
  includeUsage: false,
  askMinutes: 10,
};

const A_MESSAGE = 77;

const question = {
  id: "abc12345",
  kind: "choice" as const,
  text: "Чем продолжим?",
  options: [{ value: "0", label: "Форк", recommended: true }],
  messageId: A_MESSAGE,
  headline: "[job-finder@home] Чем продолжим?",
};

const press = {
  update_id: AN_UPDATE,
  callback_query: { id: "cb1", data: "abc12345:0", message: { chat: { id: 42 } } },
};

describe("collectAnswers", () => {
  beforeEach(() => {
    vi.mocked(readAskedQuestions).mockReturnValue([question]);
    vi.mocked(readUpdateOffset).mockReturnValue(LAST_SEEN);
    vi.mocked(fetchUpdates).mockResolvedValue([press]);
    vi.mocked(answerCallback).mockResolvedValue(undefined);
    vi.mocked(closeQuestion).mockResolvedValue(undefined);
  });

  it("takes the keyboard away once the question is answered", async () => {
    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(closeQuestion).toHaveBeenCalledWith(
      "T",
      "42",
      A_MESSAGE,
      "[job-finder@home] Чем продолжим?\n\n✓ Ответ: Форк"
    );
  });

  it("leaves the message alone when it never learned which message it was", async () => {
    vi.mocked(readAskedQuestions).mockReturnValue([{ ...question, messageId: null }]);

    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(closeQuestion).not.toHaveBeenCalled();
  });

  it("closes nothing while nothing has been answered", async () => {
    vi.mocked(fetchUpdates).mockResolvedValue([]);

    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(closeQuestion).not.toHaveBeenCalled();
  });

  it("does not touch Telegram while nothing has been asked", async () => {
    vi.mocked(readAskedQuestions).mockReturnValue([]);

    const outcome = await collectAnswers(config, LONG_POLL_SECONDS);

    expect(outcome).toBe("nothing-asked");
    expect(fetchUpdates).not.toHaveBeenCalled();
  });

  it("asks Telegram only for updates it has not seen", async () => {
    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(fetchUpdates).toHaveBeenCalledWith("T", LAST_SEEN, LONG_POLL_SECONDS);
  });

  it("writes the answer where the waiting hook will find it", async () => {
    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(writeAnswer).toHaveBeenCalledWith("abc12345", {
      said: "Форк",
      chosenValue: "0",
      callbackId: "cb1",
    });
  });

  it("remembers the newest update, so one press cannot be read twice", async () => {
    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(writeUpdateOffset).toHaveBeenCalledWith(AN_UPDATE);
  });

  it("acknowledges the press, so the button stops spinning on the phone", async () => {
    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(answerCallback).toHaveBeenCalledWith("T", "cb1");
  });

  it("has nothing to acknowledge when the user wrote words instead", async () => {
    vi.mocked(fetchUpdates).mockResolvedValue([
      { update_id: AN_UPDATE, message: { text: "сделай форк", chat: { id: 42 } } },
    ]);

    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(answerCallback).not.toHaveBeenCalled();
  });

  it("leaves the offset alone when the batch was empty", async () => {
    vi.mocked(fetchUpdates).mockResolvedValue([]);

    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(writeUpdateOffset).not.toHaveBeenCalled();
  });

  it("survives Telegram being unreachable rather than killing the watcher", async () => {
    vi.mocked(fetchUpdates).mockRejectedValue(new Error("ENOTFOUND"));

    const outcome = await collectAnswers(config, LONG_POLL_SECONDS);

    expect(outcome).toBe("failed");
    expect(writeAnswer).not.toHaveBeenCalled();
  });

  it("says why it failed, since a silent poller looks exactly like a quiet one", async () => {
    vi.mocked(fetchUpdates).mockRejectedValue(new Error("ENOTFOUND"));

    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("getUpdates failed"));
  });

  it("writes nothing when the updates answer nobody", async () => {
    vi.mocked(fetchUpdates).mockResolvedValue([
      { update_id: AN_UPDATE, callback_query: { id: "cb1", data: "gone9999:0", message: { chat: { id: 42 } } } },
    ]);

    await collectAnswers(config, LONG_POLL_SECONDS);

    expect(writeAnswer).not.toHaveBeenCalled();
  });
});
