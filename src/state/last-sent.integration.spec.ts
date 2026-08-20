import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import { readLastSent, writeLastSent } from "#state/last-sent.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-last-sent-"));
});

vi.mock("#state/file-locations.ts", () => ({
  stateHome: () => state,
  lastSentFile: (project: string) => join(state, `last-sent-${project}.txt`),
}));

const AT = 1_700_000_000_000;
const A_MESSAGE = "[a] hello";

const writeRaw = (project: string, contents: string): string => {
  const file = join(state, `last-sent-${project}.txt`);

  writeFileSync(file, contents, "utf8");

  return file;
};

describe("the last-sent stamp", () => {
  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("remembers when a project was last pinged, and what it was told", () => {
    writeLastSent("said-once", { at: AT, message: A_MESSAGE });

    expect(readLastSent("said-once")).toEqual({ at: AT, message: A_MESSAGE });
  });

  it("carries a message back over the line breaks it was written with", () => {
    writeLastSent("said-twice", { at: AT, message: "[a] one\ntwo" });

    expect(readLastSent("said-twice")?.message).toBe("[a] one\ntwo");
  });

  it("keeps one stamp per project, so one project cannot silence another", () => {
    writeLastSent("noisy", { at: AT, message: A_MESSAGE });

    expect(readLastSent("quiet")).toBeNull();
  });

  it("reports no stamp for a project that has never been pinged", () => {
    expect(readLastSent("never-seen")).toBeNull();
  });

  it("reads a stamp written before messages were kept, so a rate limit survives the upgrade", () => {
    writeRaw("upgraded", `${AT}`);

    expect(readLastSent("upgraded")).toEqual({ at: AT, message: "" });
  });

  it("reports no stamp when the file says something that is not a moment", () => {
    writeRaw("torn", `${AT}\n${A_MESSAGE}`);

    expect(readLastSent("torn")).not.toBeNull();

    writeRaw("torn", `half a write\n${A_MESSAGE}`);

    expect(readLastSent("torn")).toBeNull();
  });
});
