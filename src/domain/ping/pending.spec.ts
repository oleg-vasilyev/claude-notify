import { describe, expect, it } from "vitest";

import { selectPending, sessionsIn, type PendingPing } from "#domain/ping/pending.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const MINUTE = 60_000;
const STALE_MINUTES = 15;
const A_SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ANOTHER_SESSION = "11111111-2222-3333-4444-555555555555";
const NOBODY_WAITS = new Set<string>();

const queued = (minutesAgo: number, message: string): PendingPing => ({
  queuedAt: NOW - minutesAgo * MINUTE,
  message,
  sessionId: null,
});

const from = (ping: PendingPing, sessionId: string): PendingPing => ({ ...ping, sessionId });

const select = (pending: PendingPing[], sessionsThatMustWait: ReadonlySet<string> = NOBODY_WAITS) =>
  selectPending(pending, { now: NOW, staleMinutes: STALE_MINUTES, sessionsThatMustWait });

describe("selectPending", () => {
  it("delivers a fresh ping", () => {
    const selection = select([queued(5, "[a] hello")]);

    expect(selection.deliver).toEqual(["[a] hello"]);
    expect(selection.dropped).toEqual([]);
    expect(selection.held).toEqual([]);
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
    expect(select([])).toEqual({ deliver: [], dropped: [], held: [] });
  });

  it("reports every dropped ping, not just the first", () => {
    expect(select([queued(20, "[a] one"), queued(30, "[b] two")]).dropped).toHaveLength(2);
  });
});

describe("selectPending, when a session is not waiting yet", () => {
  const busy = new Set([A_SESSION]);

  it("holds a ping whose session is still working, rather than dropping it", () => {
    const ping = from(queued(2, "[a] a fork only you can settle"), A_SESSION);
    const selection = select([ping], busy);

    expect(selection.deliver).toEqual([]);
    expect(selection.dropped).toEqual([]);
    expect(selection.held).toEqual([ping]);
  });

  it("delivers a ping from a session that has stopped and is waiting", () => {
    const ping = from(queued(2, "[a] waiting for your approval"), ANOTHER_SESSION);

    expect(select([ping], busy).deliver).toEqual(["[a] waiting for your approval"]);
  });

  it("delivers a ping that names no session, since nothing says to wait", () => {
    expect(select([queued(2, "[a] by hand")], busy).deliver).toEqual(["[a] by hand"]);
  });

  it("drops a held ping once it goes stale, so nothing waits forever", () => {
    const ping = from(queued(20, "[a] a fork only you can settle"), A_SESSION);
    const selection = select([ping], busy);

    expect(selection.held).toEqual([]);
    expect(selection.dropped).toEqual([ping]);
  });

  it("lets one project's other session through while this one waits", () => {
    const busyPing = from(queued(2, "[a] short"), A_SESSION);
    const freePing = from(queued(1, "[a] another session is already waiting for you"), ANOTHER_SESSION);

    expect(select([busyPing, freePing], busy).deliver).toEqual(["[a] another session is already waiting for you"]);
  });

  it("does not let a held ping win the dedupe and silence a deliverable one", () => {
    const busyPing = from(queued(2, "[a] a very long message from the session that is busy"), A_SESSION);
    const freePing = from(queued(1, "[a] brief"), ANOTHER_SESSION);

    expect(select([busyPing, freePing], busy).deliver).toEqual(["[a] brief"]);
  });
});

describe("sessionsIn", () => {
  it("collects every session worth asking about, once", () => {
    const sessions = sessionsIn([
      from(queued(1, "[a] one"), A_SESSION),
      from(queued(1, "[a] two"), A_SESSION),
      queued(1, "[b] three"),
      from(queued(1, "[b] four"), ANOTHER_SESSION),
    ]);

    expect(sessions).toEqual([A_SESSION, ANOTHER_SESSION]);
  });

  it("asks about nothing when no ping names a session", () => {
    expect(sessionsIn([queued(1, "[a] one")])).toEqual([]);
  });
});
