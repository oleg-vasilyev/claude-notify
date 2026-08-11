import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startFakeTelegram, type FakeTelegram } from "./fake-telegram.ts";
import { startPingTool, type PingToolServer } from "./ping-tool-process.ts";


const CHAT = 4242;
const TOKEN = "424242:AAH-nothing-here-reaches-telegram";
const ALWAYS_AWAY = 0;
const NEVER_AWAY = 999;
const NO_ANSWERING = 0;

describe("the ping tool a model calls", () => {
  let telegram: FakeTelegram;
  let state: string;
  let workingIn: string;
  let tool: PingToolServer;

  const envWith = (minIdleMinutes: number): string => {
    const path = join(state, `settings-${minIdleMinutes}.env`);

    writeFileSync(
      path,
      [
        `BOT_TOKEN=${TOKEN}`,
        `CHAT_ID=${CHAT}`,
        "MACHINE_LABEL=work",
        `MIN_IDLE_MINUTES=${minIdleMinutes}`,
        `ASK_MINUTES=${NO_ANSWERING}`,
        "QUOTE_QUESTIONS=false",
        "INCLUDE_USAGE=false",
      ].join("\n"),
      "utf8"
    );

    return path;
  };

  const started = async (minIdleMinutes: number): Promise<PingToolServer> => {
    tool = await startPingTool({
      home: state,
      envFile: envWith(minIdleMinutes),
      apiRoot: telegram.apiRoot,
      workingIn,
    });

    return tool;
  };

  const log = (): string => readFileSync(join(state, "log.txt"), "utf8");

  const forgetTheProjectDirectory = (): void => {
    try {
      rmSync(join(workingIn, ".."), { recursive: true, force: true });
    } catch {
      return;
    }
  };

  const stopTheWatcherAQueuedPingStarted = (): void => {
    const lock = join(state, "watcher.lock");

    if (!existsSync(lock)) {
      return;
    }

    try {
      process.kill(Number(readFileSync(lock, "utf8").trim()));
    } catch {
      return;
    }
  };

  beforeEach(async () => {
    telegram = await startFakeTelegram();
    state = mkdtempSync(join(tmpdir(), "claude-notify-tool-state-"));
    workingIn = join(mkdtempSync(join(tmpdir(), "claude-notify-tool-cwd-")), "a-project");
    mkdirSync(workingIn);
  });

  afterEach(async () => {
    await tool.stop();
    stopTheWatcherAQueuedPingStarted();
    await telegram.stop();
    rmSync(state, { recursive: true, force: true });
    forgetTheProjectDirectory();
  });

  it("offers exactly one tool, and says what it needs", async () => {
    const described = await (await started(ALWAYS_AWAY)).listTools();

    expect(described.name).toBe("ping_user");
    expect(described.required).toEqual(["message"]);
    expect(described.description).toContain("Do NOT try to judge");
  });

  it("delivers what the model asked to say, to the real Telegram call", async () => {
    const answer = await (await started(ALWAYS_AWAY)).ping("нужен выбор по миграции");

    await telegram.whenAsked();

    expect(answer.failed).toBe(false);
    expect(telegram.sentText()).toContain("нужен выбор по миграции");
  });

  it("names the project from the directory the session is in, not from the model", async () => {
    await (await started(ALWAYS_AWAY)).ping("жду решения");

    await telegram.whenAsked();

    expect(telegram.sentText()).toContain("[a-project@work]");
  });

  it("replaces a project name the model invented for itself", async () => {
    await (await started(ALWAYS_AWAY)).ping("[another-project] жду решения");

    await telegram.whenAsked();

    expect(telegram.sentText()).toContain("[a-project@work] жду решения");
    expect(telegram.sentText()).not.toContain("another-project");
  });

  it("tells the model to carry on when the user is still at the keyboard", async () => {
    const answer = await (await started(NEVER_AWAY)).ping("жду апрува");

    expect(answer.failed).toBe(false);
    expect(answer.said).toContain("Carry on");
    expect(log()).toContain("QUEUED");
  });

  it("refuses a tool it does not have, rather than pinging something else", async () => {
    const answer = await (await started(ALWAYS_AWAY)).callByName("ping_everyone", { message: "x" });

    expect(answer.failed).toBe(true);
  });

  it("survives a call with nothing to say", async () => {
    const answer = await (await started(ALWAYS_AWAY)).callByName("ping_user", { message: "" });

    expect(answer.failed).toBe(true);
    expect(answer.said).not.toBe("");
  });
});
