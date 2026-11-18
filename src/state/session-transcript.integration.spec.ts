import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readChatTitle, toolHasAnswered } from "#state/session-transcript.ts";


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

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("toolHasAnswered", () => {
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

describe("readChatTitle", () => {
  const TITLE_TAIL_BYTES = 2 * 1024 * 1024;
  const PAST_THE_TAIL = TITLE_TAIL_BYTES + 1024;

  const titled = (title: string): string =>
    JSON.stringify({ type: "custom-title", customTitle: title, sessionId: "a-session" });

  const filler = (bytes: number): string =>
    JSON.stringify({ type: "user", message: { content: "x".repeat(bytes) } });

  it("reads the chat's title from a transcript", () => {
    const path = transcript("titled.jsonl", [asked(TOOL_USE), titled("Разбор логов"), answered(TOOL_USE)]);

    expect(readChatTitle(path)).toBe("Разбор логов");
  });

  it("finds the latest title near the end of a transcript far larger than it reads", () => {
    const path = transcript("big-titled.jsonl", [
      titled("Старое имя"),
      filler(PAST_THE_TAIL),
      titled("Разбор логов"),
      answered(TOOL_USE),
    ]);

    expect(readChatTitle(path)).toBe("Разбор логов");
  });

  it("gives up on a title buried deeper than it reads, rather than reading the whole file", () => {
    const path = transcript("buried.jsonl", [titled("Разбор логов"), filler(PAST_THE_TAIL)]);

    expect(readChatTitle(path)).toBeNull();
  });

  it("finds no title when the transcript cannot be read at all", () => {
    expect(readChatTitle(join(folder, "never-written.jsonl"))).toBeNull();
  });
});
