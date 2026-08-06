import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendPending,
  claimWatcherLock,
  clearPending,
  lockedWatcherProcessId,
  readLastSentAt,
  readPending,
  releaseWatcherLock,
  writeLastSentAt,
} from "#edges/store.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync: makeTemp } = require("node:fs") as typeof import("node:fs");
  const { tmpdir: temp } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return makeTemp(at(temp(), "claude-notify-store-"));
});

vi.mock("#edges/paths.ts", () => ({
  stateHome: () => state,
  pendingFile: () => join(state, "pending.jsonl"),
  watcherLockFile: () => join(state, "watcher.lock"),
  lastSentFile: (project: string) => join(state, `last-sent-${project}.txt`),
}));

const A_PING = { queuedAt: 1_700_000_000_000, message: "[a] hello" };

describe("the state files", () => {
  beforeEach(() => {
    clearPending();
    releaseWatcherLock();
  });

  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("reads back what it queued", () => {
    appendPending(A_PING);

    expect(readPending()).toEqual([A_PING]);
  });

  it("keeps queued pings in the order they arrived", () => {
    const second = { queuedAt: A_PING.queuedAt + 1, message: "[b] later" };

    appendPending(A_PING);
    appendPending(second);

    expect(readPending()).toEqual([A_PING, second]);
  });

  it("reports an empty queue before anything has been queued", () => {
    expect(readPending()).toEqual([]);
  });

  it("survives a half-written line rather than losing the whole queue", () => {
    appendPending(A_PING);
    writeFileSync(join(state, "pending.jsonl"), `${JSON.stringify(A_PING)}\n{"queuedAt":`, "utf8");

    expect(readPending()).toEqual([A_PING]);
  });

  it("forgets the queue once it is flushed", () => {
    appendPending(A_PING);
    clearPending();

    expect(readPending()).toEqual([]);
  });

  it("remembers when a project was last pinged", () => {
    writeLastSentAt("job-finder", A_PING.queuedAt);

    expect(readLastSentAt("job-finder")).toBe(A_PING.queuedAt);
  });

  it("keeps one stamp per project, so one project cannot silence another", () => {
    writeLastSentAt("job-finder", A_PING.queuedAt);

    expect(readLastSentAt("FoolProof")).toBeNull();
  });

  it("reports no stamp for a project that has never been pinged", () => {
    expect(readLastSentAt("never-seen")).toBeNull();
  });

  it("holds and releases the watcher lock", () => {
    claimWatcherLock(process.pid);

    expect(lockedWatcherProcessId()).toBe(process.pid);

    releaseWatcherLock();

    expect(lockedWatcherProcessId()).toBeNull();
  });

  it("treats a corrupted lock as no lock at all", () => {
    writeFileSync(join(state, "watcher.lock"), "not a pid", "utf8");

    expect(lockedWatcherProcessId()).toBeNull();
  });
});

describe("the temporary state directory", () => {
  it("is a real directory made for this run", () => {
    expect(state.startsWith(mkdtempSync(join(tmpdir(), "claude-notify-store-")).slice(0, 20))).toBe(
      true
    );
  });
});
