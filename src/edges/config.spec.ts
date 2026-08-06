import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readConfigFrom } from "#edges/config.ts";


const directory = mkdtempSync(join(tmpdir(), "claude-notify-config-"));

const configWith = (contents: string): string => {
  const path = join(directory, `${Math.random()}.json`);

  writeFileSync(path, contents, "utf8");

  return path;
};

describe("readConfigFrom", () => {
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reads a full config", () => {
    const path = configWith(
      JSON.stringify({
        token: "T",
        chat_id: "42",
        machine_label: "work",
        min_idle_minutes: 5,
        stale_minutes: 20,
        include_usage: false,
      })
    );

    expect(readConfigFrom(path)).toEqual({
      token: "T",
      chatId: "42",
      machineLabel: "work",
      minIdleMinutes: 5,
      staleMinutes: 20,
      includeUsage: false,
    });
  });

  it("fills in the defaults a config written by an older version lacks", () => {
    const path = configWith(JSON.stringify({ token: "T", chat_id: "42" }));

    expect(readConfigFrom(path)).toEqual({
      token: "T",
      chatId: "42",
      machineLabel: "",
      minIdleMinutes: 3,
      staleMinutes: 15,
      includeUsage: true,
    });
  });

  it("refuses a config with no token, because a ping could never be sent", () => {
    expect(readConfigFrom(configWith(JSON.stringify({ chat_id: "42" })))).toBeNull();
  });

  it("refuses a config with no chat", () => {
    expect(readConfigFrom(configWith(JSON.stringify({ token: "T" })))).toBeNull();
  });

  it("refuses a corrupted file rather than throwing at the hook", () => {
    expect(readConfigFrom(configWith("{ not json"))).toBeNull();
  });

  it("refuses a file that is not there", () => {
    expect(readConfigFrom(join(directory, "absent.json"))).toBeNull();
  });
});
