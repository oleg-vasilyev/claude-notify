import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { modifiedTimesOf } from "#state/session-transcript.ts";


const MILLISECONDS_PER_SECOND = 1000;
const WRITTEN_AT_SECONDS = 1_700_000_000;

const folder = mkdtempSync(join(tmpdir(), "claude-notify-transcripts-"));

const transcript = (name: string, atSeconds: number): string => {
  const path = join(folder, name);

  writeFileSync(path, "{}\n", "utf8");
  utimesSync(path, atSeconds, atSeconds);

  return path;
};

describe("modifiedTimesOf", () => {
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("reports when a session was last written to", () => {
    const path = transcript("one.jsonl", WRITTEN_AT_SECONDS);

    expect(modifiedTimesOf([path]).get(path)).toBe(WRITTEN_AT_SECONDS * MILLISECONDS_PER_SECOND);
  });

  it("says nothing about a transcript that is not there, rather than guessing a time", () => {
    const missing = join(folder, "never-written.jsonl");

    expect(modifiedTimesOf([missing]).has(missing)).toBe(false);
  });

  it("keeps the transcripts it can read when one of them is missing", () => {
    const path = transcript("two.jsonl", WRITTEN_AT_SECONDS);

    expect([...modifiedTimesOf([join(folder, "gone.jsonl"), path]).keys()]).toEqual([path]);
  });

  it("asks about nothing and answers with nothing", () => {
    expect(modifiedTimesOf([]).size).toBe(0);
  });
});
