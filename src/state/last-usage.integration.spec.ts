import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { rememberedUsage, rememberUsage } from "#state/last-usage.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-usage-"));
});

vi.mock("#state/file-locations.ts", () => ({
  stateHome: () => state,
  lastUsageFile: () => join(state, "last-usage.json"),
}));

const READ_AT = 1_700_000_000_000;
const SNAPSHOT = { limits: [{ group: "session", percent: 33 }] };

describe("the last usage a ping managed to read", () => {
  beforeEach(() => {
    rmSync(join(state, "last-usage.json"), { force: true });
  });

  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("reads back what it kept, with the moment it was read", () => {
    rememberUsage(SNAPSHOT, READ_AT);

    expect(rememberedUsage()).toEqual({ snapshot: SNAPSHOT, readAt: READ_AT });
  });

  it("knows nothing before a ping has ever managed to read the limits", () => {
    expect(rememberedUsage()).toBeNull();
  });

  it("keeps only the newest reading, since an older one can only be worse", () => {
    rememberUsage(SNAPSHOT, READ_AT);
    rememberUsage({ limits: [{ group: "weekly", percent: 70 }] }, READ_AT + 1);

    expect(rememberedUsage()?.readAt).toBe(READ_AT + 1);
  });

  it("treats a half-written file as nothing kept, rather than as a reading", () => {
    writeFileSync(join(state, "last-usage.json"), '{"snapshot":', "utf8");

    expect(rememberedUsage()).toBeNull();
  });

  it("refuses a file with no moment in it, which could not be aged", () => {
    writeFileSync(join(state, "last-usage.json"), '{"snapshot":{"limits":[]}}', "utf8");

    expect(rememberedUsage()).toBeNull();
  });
});
