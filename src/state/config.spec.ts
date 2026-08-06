import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readConfigFrom, writeConfigTo, type Config } from "#state/config.ts";


const directory = mkdtempSync(join(tmpdir(), "claude-notify-config-"));

const envWith = (contents: string): string => {
  const path = join(directory, `${Math.random()}.env`);

  writeFileSync(path, contents, "utf8");

  return path;
};

const config: Config = {
  token: "7968:AAF-9",
  chatId: "42",
  machineLabel: "work",
  minIdleMinutes: 5,
  staleMinutes: 20,
  includeUsage: false,
};

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("readConfigFrom", () => {
  it("reads a full .env", () => {
    const path = envWith(
      "BOT_TOKEN=7968:AAF-9\nCHAT_ID=42\nMACHINE_LABEL=work\nMIN_IDLE_MINUTES=5\nSTALE_MINUTES=20\nINCLUDE_USAGE=false\n"
    );

    expect(readConfigFrom(path)).toEqual(config);
  });

  it("fills in the defaults for everything but the two required keys", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\n");

    expect(readConfigFrom(path)).toEqual({
      token: "T",
      chatId: "42",
      machineLabel: "",
      minIdleMinutes: 3,
      staleMinutes: 15,
      includeUsage: true,
    });
  });

  it("treats a number it cannot read as absent rather than as zero", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\nMIN_IDLE_MINUTES=soon\n");

    expect(readConfigFrom(path)?.minIdleMinutes).toBe(3);
  });

  it("refuses a file with no token, because a ping could never be sent", () => {
    expect(readConfigFrom(envWith("CHAT_ID=42\n"))).toBeNull();
  });

  it("refuses a file with no chat", () => {
    expect(readConfigFrom(envWith("BOT_TOKEN=T\n"))).toBeNull();
  });

  it("refuses a token left as the empty placeholder", () => {
    expect(readConfigFrom(envWith("BOT_TOKEN=\nCHAT_ID=42\n"))).toBeNull();
  });

  it("refuses a file that is not there", () => {
    expect(readConfigFrom(join(directory, "absent.env"))).toBeNull();
  });
});

describe("writeConfigTo", () => {
  it("writes settings a later read gets back unchanged", () => {
    const path = join(directory, "written.env");

    writeConfigTo(path, config);

    expect(readConfigFrom(path)).toEqual(config);
  });

  it("keeps the comments a person wrote in their own .env", () => {
    const path = envWith("# my notes\nBOT_TOKEN=old\nCHAT_ID=42\n");

    writeConfigTo(path, config);

    expect(readFileSync(path, "utf8")).toContain("# my notes");
  });
});
