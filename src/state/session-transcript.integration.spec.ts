import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { toolHasAnswered } from "#state/session-transcript.ts";


const TOOL_USE = "toolu_0000000000000000000001";
const ANOTHER_TOOL_USE = "toolu_0000000000000000000002";
const PADDING_LINES = 4000;

const folder = mkdtempSync(join(tmpdir(), "claude-notify-transcripts-"));

const asked = (id: string): string =>
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", id, name: "Bash" }] },
  });

const answered = (id: string): string =>
  JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id }] },
  });

const transcript = (name: string, lines: string[]): string => {
  const path = join(folder, name);

  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");

  return path;
};

describe("toolHasAnswered", () => {
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("sees the answer to a tool call, which is the wall coming down", () => {
    const path = transcript("answered.jsonl", [asked(TOOL_USE), answered(TOOL_USE)]);

    expect(toolHasAnswered(path, TOOL_USE)).toBe(true);
  });

  it("sees a tool call still waiting, which is the wall still standing", () => {
    const path = transcript("waiting.jsonl", [asked(TOOL_USE)]);

    expect(toolHasAnswered(path, TOOL_USE)).toBe(false);
  });

  it("does not mistake another tool call's answer for this one", () => {
    const path = transcript("other.jsonl", [asked(TOOL_USE), answered(ANOTHER_TOOL_USE)]);

    expect(toolHasAnswered(path, TOOL_USE)).toBe(false);
  });

  it("finds an answer at the end of a transcript far larger than it reads", () => {
    const padding = Array.from({ length: PADDING_LINES }, () => answered(ANOTHER_TOOL_USE));
    const path = transcript("long.jsonl", [asked(TOOL_USE), ...padding, answered(TOOL_USE)]);

    expect(toolHasAnswered(path, TOOL_USE)).toBe(true);
  });

  it("says the wall still stands when the transcript cannot be read at all", () => {
    expect(toolHasAnswered(join(folder, "never-written.jsonl"), TOOL_USE)).toBe(false);
  });
});
