import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { labelLogWith, log } from "#state/log.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-log-"));
});

vi.mock("#state/file-locations.ts", () => ({
  stateHome: () => state,
  logFile: () => join(state, "log.txt"),
}));

const A_SESSION = "9712c0e5-78d4-4a00-a17e-32ad1f9722a6";
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /;

const lines = (): string[] => readFileSync(join(state, "log.txt"), "utf8").trimEnd().split("\n");

describe("the log file", () => {
  beforeEach(() => {
    rmSync(join(state, "log.txt"), { force: true });
  });

  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("writes a line with nothing between the time and the words before a session is named", () => {
    log("WATCHER started");

    expect(lines()[0]?.replace(STAMP, "")).toBe("WATCHER started");
  });

  it("puts the session's label between the time and the words once it is named", () => {
    labelLogWith(A_SESSION);
    log("SOUND turnEnded | Stop");
    log("QUEUED idle=0s | [a-project@home] закончил ход, ждёт тебя");

    expect(lines().map((line) => line.replace(STAMP, ""))).toEqual([
      "[9712c0e5] SOUND turnEnded | Stop",
      "[9712c0e5] QUEUED idle=0s | [a-project@home] закончил ход, ждёт тебя",
    ]);
  });
});
