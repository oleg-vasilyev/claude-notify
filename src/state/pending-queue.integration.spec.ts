import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readLastSentAt, writeLastSentAt } from "#state/last-sent.ts";
import { appendPending, clearPending, readPending } from "#state/pending-queue.ts";
import {
  claimWatcherLock,
  lockedWatcherProcessId,
  releaseWatcherLock,
} from "#state/watcher-lock.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-state-"));
});

vi.mock("#state/file-locations.ts", () => ({
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
    writeLastSentAt("a-project", A_PING.queuedAt);

    expect(readLastSentAt("a-project")).toBe(A_PING.queuedAt);
  });

  it("keeps one stamp per project, so one project cannot silence another", () => {
    writeLastSentAt("a-project", A_PING.queuedAt);

    expect(readLastSentAt("another-project")).toBeNull();
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
