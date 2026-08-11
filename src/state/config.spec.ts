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

const DEFAULT_RELAY_PORT = 8787;
const ANOTHER_PORT = 9100;

const config: Config = {
  delivery: { kind: "telegram", token: "7968:AAF-9", chatId: "42" },
  machineLabel: "work",
  minIdleMinutes: 5,
  staleMinutes: 20,
  includeUsage: false,
  askMinutes: 7,
  quoteQuestions: true,
  relaySecret: "",
  relayPort: DEFAULT_RELAY_PORT,
};

const relayed: Config = {
  ...config,
  delivery: { kind: "relay", url: "http://home-laptop:8787" },
  relaySecret: "s3cr3t",
  relayPort: ANOTHER_PORT,
};

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("readConfigFrom", () => {
  it("reads a full .env", () => {
    const path = envWith(
      "BOT_TOKEN=7968:AAF-9\nCHAT_ID=42\nMACHINE_LABEL=work\nMIN_IDLE_MINUTES=5\nSTALE_MINUTES=20\nINCLUDE_USAGE=false\nASK_MINUTES=7\n"
    );

    expect(readConfigFrom(path)).toEqual(config);
  });

  it("fills in the defaults for everything but the two required keys", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\n");

    expect(readConfigFrom(path)).toEqual({
      delivery: { kind: "telegram", token: "T", chatId: "42" },
      machineLabel: "",
      minIdleMinutes: 3,
      staleMinutes: 15,
      includeUsage: true,
      askMinutes: 10,
      quoteQuestions: true,
      relaySecret: "",
      relayPort: DEFAULT_RELAY_PORT,
    });
  });

  it("keeps the question to itself once the machine says not to quote", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\nQUOTE_QUESTIONS=false\n");

    expect(readConfigFrom(path)?.quoteQuestions).toBe(false);
  });

  it("reads zero ask minutes rather than falling back to the default, since zero turns answering off", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\nASK_MINUTES=0\n");

    expect(readConfigFrom(path)?.askMinutes).toBe(0);
  });

  it("treats a number it cannot read as absent rather than as zero", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\nMIN_IDLE_MINUTES=soon\n");

    expect(readConfigFrom(path)?.minIdleMinutes).toBe(3);
  });

  it("reads a machine that pings through a relay and holds no token of its own", () => {
    const path = envWith("RELAY_URL=http://home-laptop:8787\nRELAY_SECRET=s3cr3t\n");

    expect(readConfigFrom(path)?.delivery).toEqual({
      kind: "relay",
      url: "http://home-laptop:8787",
    });
  });

  it("carries the shared secret a relayed machine has to prove itself with", () => {
    const path = envWith("RELAY_URL=http://home-laptop:8787\nRELAY_SECRET=s3cr3t\n");

    expect(readConfigFrom(path)?.relaySecret).toBe("s3cr3t");
  });

  it("reads the port a relay host is to listen on", () => {
    const path = envWith(`BOT_TOKEN=T\nCHAT_ID=42\nRELAY_PORT=${ANOTHER_PORT}\n`);

    expect(readConfigFrom(path)?.relayPort).toBe(ANOTHER_PORT);
  });

  it("sends straight to Telegram on a host that both relays for others and has a token", () => {
    const path = envWith("BOT_TOKEN=T\nCHAT_ID=42\nRELAY_URL=http://elsewhere:8787\n");

    expect(readConfigFrom(path)?.delivery.kind).toBe("telegram");
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

  it("refuses a file that names neither Telegram nor a relay", () => {
    expect(readConfigFrom(envWith("MACHINE_LABEL=work\nRELAY_SECRET=s3cr3t\n"))).toBeNull();
  });

  it("refuses a relay url left as the empty placeholder", () => {
    expect(readConfigFrom(envWith("RELAY_URL=\nRELAY_SECRET=s3cr3t\n"))).toBeNull();
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

  it("writes a relay machine's settings a later read gets back unchanged", () => {
    const path = join(directory, "relayed.env");

    writeConfigTo(path, relayed);

    expect(readConfigFrom(path)).toEqual(relayed);
  });

  it("blanks the token when a machine is switched over to a relay", () => {
    const path = envWith("BOT_TOKEN=7968:AAF-9\nCHAT_ID=42\n");

    writeConfigTo(path, relayed);

    expect(readFileSync(path, "utf8")).toContain("BOT_TOKEN=\n");
  });

  it("keeps the comments a person wrote in their own .env", () => {
    const path = envWith("# my notes\nBOT_TOKEN=old\nCHAT_ID=42\n");

    writeConfigTo(path, config);

    expect(readFileSync(path, "utf8")).toContain("# my notes");
  });
});
