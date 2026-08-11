import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startFakeTelegram, type FakeTelegram } from "./fake-telegram.ts";
import { runHook, type HookWorld } from "./hook-process.ts";
import { startRelayProcess, type RelayProcess } from "./relay-process.ts";


const CHAT = 4242;
const TOKEN = "424242:AAH-nothing-here-reaches-telegram";
const SECRET = "the-secret-both-machines-share";
const ALWAYS_AWAY = 0;
const NO_ANSWERING = 0;
const ANY_FREE_PORT = 0;
const NOWHERE = "http://127.0.0.1:1";
const NOTHING = 0;

const turnEnded = { cwd: "D:\\Temp\\job-finder", background_tasks: [] };

const askedPayload = {
  cwd: "D:\\Temp\\job-finder",
  tool_name: "AskUserQuestion",
  tool_input: {
    questions: [
      {
        question: "Выкатываем миграцию на прод прямо сейчас?",
        options: [{ label: "Да", description: "(Рекомендую)" }, { label: "Утром" }],
      },
    ],
  },
};

describe("a ping relayed by the machine that can reach Telegram", () => {
  let telegram: FakeTelegram;
  let relay: RelayProcess;
  let homeState: string;
  let workState: string;
  let work: HookWorld;

  const workEnvWith = (secret: string): string => {
    const path = join(workState, `settings-${secret}.env`);

    writeFileSync(
      path,
      [
        `RELAY_URL=${relay.url}`,
        `RELAY_SECRET=${secret}`,
        "MACHINE_LABEL=work",
        `MIN_IDLE_MINUTES=${ALWAYS_AWAY}`,
        `ASK_MINUTES=${NO_ANSWERING}`,
        "QUOTE_QUESTIONS=false",
        "INCLUDE_USAGE=false",
      ].join("\n"),
      "utf8"
    );

    return path;
  };

  const sends = (): unknown[] => telegram.calls().filter((call) => call.method === "sendMessage");

  const logOf = (state: string): string => readFileSync(join(state, "log.txt"), "utf8");

  beforeEach(async () => {
    telegram = await startFakeTelegram();
    homeState = mkdtempSync(join(tmpdir(), "claude-notify-relay-home-"));
    workState = mkdtempSync(join(tmpdir(), "claude-notify-relay-work-"));

    const homeEnv = join(homeState, "settings.env");

    writeFileSync(
      homeEnv,
      [
        `BOT_TOKEN=${TOKEN}`,
        `CHAT_ID=${CHAT}`,
        "MACHINE_LABEL=home",
        `RELAY_SECRET=${SECRET}`,
        `RELAY_PORT=${ANY_FREE_PORT}`,
        "INCLUDE_USAGE=false",
      ].join("\n"),
      "utf8"
    );

    relay = await startRelayProcess({
      home: homeState,
      envFile: homeEnv,
      apiRoot: telegram.apiRoot,
    });

    work = { home: workState, envFile: workEnvWith(SECRET), apiRoot: NOWHERE };
  });

  afterEach(async () => {
    await relay.stop();
    await telegram.stop();
    rmSync(homeState, { recursive: true, force: true });
    rmSync(workState, { recursive: true, force: true });
  });

  it("carries a turn ending from the work machine all the way to the phone", async () => {
    await runHook("Stop", turnEnded, work);
    await telegram.whenAsked();

    expect(telegram.sentText()).toBe("[job-finder@work] закончил ход, ждёт тебя");
  });

  it("keeps the work machine's own label, so the two streams stay apart in one chat", async () => {
    await runHook("Stop", turnEnded, work);
    await telegram.whenAsked();

    expect(telegram.sentText()).toContain("@work");
  });

  it("says on both machines which one actually spoke to Telegram", async () => {
    await runHook("Stop", turnEnded, work);
    await telegram.whenAsked();

    expect(logOf(workState)).toContain("SENT via relay");
    expect(logOf(homeState)).toContain("RELAY sent");
  });

  it("keeps the text of a question on the machine that asked it", async () => {
    await runHook("PreToolUse", askedPayload, work);
    await telegram.whenAsked();

    expect(telegram.sentText()).toBe("[job-finder@work] ждёт твоего ответа");
    expect(telegram.sentText()).not.toContain("миграцию");
  });

  it("never puts buttons on a question from a relayed machine, since no answer could come back", async () => {
    const finished = await runHook("PreToolUse", askedPayload, work);

    await telegram.whenAsked();

    expect(telegram.keyboard()).toEqual([]);
    expect(finished.stdout).toBe("");
  });

  it("forwards nothing at all for a machine carrying the wrong secret", async () => {
    const stranger = { ...work, envFile: workEnvWith("not-the-secret") };

    await runHook("Stop", turnEnded, stranger);

    expect(sends().length).toBe(NOTHING);
  });

  it("says on both machines that the ping was refused, rather than losing it quietly", async () => {
    const stranger = { ...work, envFile: workEnvWith("not-the-secret") };

    await runHook("Stop", turnEnded, stranger);

    expect(logOf(workState)).toContain("ERROR send failed");
    expect(logOf(homeState)).toContain("RELAY refused");
  });
});
