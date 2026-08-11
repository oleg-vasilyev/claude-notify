import { describe, expect, it } from "vitest";

import { selectPending, type PendingPing } from "#domain/ping/pending.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const MINUTE = 60_000;
const STALE_MINUTES = 15;

const queued = (minutesAgo: number, message: string): PendingPing => ({
  queuedAt: NOW - minutesAgo * MINUTE,
  message,
});

const select = (pending: PendingPing[]) =>
  selectPending(pending, { now: NOW, staleMinutes: STALE_MINUTES });

describe("selectPending", () => {
  it("delivers a fresh ping", () => {
    const selection = select([queued(5, "[a] hello")]);

    expect(selection.deliver).toEqual(["[a] hello"]);
    expect(selection.dropped).toEqual([]);
  });

  it("drops a ping that went stale while the user sat through it", () => {
    const selection = select([queued(20, "[a] old news")]);

    expect(selection.deliver).toEqual([]);
    expect(selection.dropped).toEqual([queued(20, "[a] old news")]);
  });

  it("keeps a ping that is exactly at the staleness edge", () => {
    expect(select([queued(STALE_MINUTES, "[a] borderline")]).deliver).toEqual(["[a] borderline"]);
  });

  it("keeps the most informative ping per project", () => {
    const selection = select([
      queued(2, "[a] short"),
      queued(1, "[a] the model's own account of what it is waiting for"),
    ]);

    expect(selection.deliver).toEqual(["[a] the model's own account of what it is waiting for"]);
  });

  it("keeps the richer ping even when it was queued first", () => {
    const selection = select([
      queued(2, "[a] the model's own account of what it is waiting for"),
      queued(1, "[a] short"),
    ]);

    expect(selection.deliver).toEqual(["[a] the model's own account of what it is waiting for"]);
  });

  it("delivers one ping per project", () => {
    const selection = select([queued(2, "[a] first"), queued(1, "[b] second")]);

    expect(selection.deliver).toEqual(["[a] first", "[b] second"]);
  });

  it("treats the labelled and plain forms of one project as the same project", () => {
    const selection = select([
      queued(2, "[a] generic fallback"),
      queued(1, "[a@home] what the model actually wanted to say"),
    ]);

    expect(selection.deliver).toEqual(["[a@home] what the model actually wanted to say"]);
  });

  it("handles an empty queue", () => {
    expect(select([])).toEqual({ deliver: [], dropped: [] });
  });

  it("reports every dropped ping, not just the first", () => {
    expect(select([queued(20, "[a] one"), queued(30, "[b] two")]).dropped).toHaveLength(2);
  });
});
