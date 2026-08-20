import { describe, expect, it } from "vitest";

import {
  DROP,
  projectsIn,
  selectPending,
  sessionsIn,
  type PendingPing,
  type SentPing,
} from "#domain/ping/pending.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const MINUTE = 60_000;
const STALE_MINUTES = 15;
const A_SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ANOTHER_SESSION = "11111111-2222-3333-4444-555555555555";
const NOBODY_WAITS = new Set<string>();
const NOTHING_SENT = new Map<string, SentPing>();
const LEFT_BEFORE_ANY_PING = NOW - 60 * MINUTE;

const queued = (minutesAgo: number, message: string): PendingPing => ({
  queuedAt: NOW - minutesAgo * MINUTE,
  message,
  sessionId: null,
});

const from = (ping: PendingPing, sessionId: string): PendingPing => ({ ...ping, sessionId });

const select = (pending: PendingPing[], sessionsThatMustWait: ReadonlySet<string> = NOBODY_WAITS) =>
  selectPending(pending, {
    now: NOW,
    staleMinutes: STALE_MINUTES,
    lastInputAt: LEFT_BEFORE_ANY_PING,
    sessionsThatMustWait,
    sentPerProject: NOTHING_SENT,
  });

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
    expect(selection.dropped).toEqual([{ kind: DROP.stale, ping: queued(20, "[a] old news") }]);
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

  it("keeps the earlier of two the same length, so a re-flush cannot change its mind", () => {
    expect(select([queued(2, "[a] first"), queued(1, "[a] other")]).deliver).toEqual(["[a] first"]);
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

describe("selectPending, when the user was still at the keyboard afterwards", () => {
  const stillTyping = (minutesAgo: number) =>
    selectPending([queued(5, "[a] the turn ended")], {
      now: NOW,
      staleMinutes: STALE_MINUTES,
      lastInputAt: NOW - minutesAgo * MINUTE,
      sessionsThatMustWait: NOBODY_WAITS,
      sentPerProject: NOTHING_SENT,
    });

  it("drops a ping the user was present for, because the sound and the screen already told them", () => {
    const selection = stillTyping(3);

    expect(selection.deliver).toEqual([]);
    expect(selection.dropped).toEqual([{ kind: DROP.seen, ping: queued(5, "[a] the turn ended") }]);
  });

  it("delivers a ping raised after the user had already stopped touching anything", () => {
    expect(stillTyping(9).deliver).toEqual(["[a] the turn ended"]);
  });

  it("delivers when the last input landed in the same millisecond, since that is not yet afterwards", () => {
    const selection = selectPending([queued(5, "[a] the turn ended")], {
      now: NOW,
      staleMinutes: STALE_MINUTES,
      lastInputAt: NOW - 5 * MINUTE,
      sessionsThatMustWait: NOBODY_WAITS,
      sentPerProject: NOTHING_SENT,
    });

    expect(selection.deliver).toEqual(["[a] the turn ended"]);
  });

  it("counts staleness first, so the older truth is the one logged", () => {
    const selection = selectPending([queued(20, "[a] old news")], {
      now: NOW,
      staleMinutes: STALE_MINUTES,
      lastInputAt: NOW,
      sessionsThatMustWait: NOBODY_WAITS,
      sentPerProject: NOTHING_SENT,
    });

    expect(selection.dropped).toEqual([{ kind: DROP.stale, ping: queued(20, "[a] old news") }]);
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
    expect(selection.dropped).toEqual([{ kind: DROP.stale, ping }]);
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

describe("selectPending, when the same words already went out", () => {
  const THE_TURN_ENDED = "[a] the turn ended";
  const alreadySent = (message: string, at: number) => new Map([["a", { at, message }]]);

  const afterSending = (
    pending: PendingPing[],
    sent: ReadonlyMap<string, SentPing>,
    busy = NOBODY_WAITS
  ) =>
    selectPending(pending, {
      now: NOW,
      staleMinutes: STALE_MINUTES,
      lastInputAt: LEFT_BEFORE_ANY_PING,
      sessionsThatMustWait: busy,
      sentPerProject: sent,
    });

  it("drops the queued repeat of a message the phone has already shown", () => {
    const ping = queued(5, THE_TURN_ENDED);
    const selection = afterSending([ping], alreadySent(THE_TURN_ENDED, NOW - 2 * MINUTE));

    expect(selection.deliver).toEqual([]);
    expect(selection.dropped).toEqual([{ kind: DROP.repeat, ping }]);
  });

  it("drops it even while its session works on, rather than holding a repeat for later", () => {
    const ping = from(queued(5, THE_TURN_ENDED), A_SESSION);
    const selection = afterSending(
      [ping],
      alreadySent(THE_TURN_ENDED, NOW - 2 * MINUTE),
      new Set([A_SESSION])
    );

    expect(selection.held).toEqual([]);
    expect(selection.dropped).toEqual([{ kind: DROP.repeat, ping }]);
  });

  it("delivers a ping that says something else, since only a repeat is worthless", () => {
    const selection = afterSending(
      [queued(5, "[a] needs your call on the schema")],
      alreadySent(THE_TURN_ENDED, NOW - 2 * MINUTE)
    );

    expect(selection.deliver).toEqual(["[a] needs your call on the schema"]);
  });

  it("delivers a repeat raised after that send, since the news happened twice", () => {
    expect(
      afterSending([queued(5, THE_TURN_ENDED)], alreadySent(THE_TURN_ENDED, NOW - 9 * MINUTE))
        .deliver
    ).toEqual([THE_TURN_ENDED]);
  });

  it("delivers when the send landed in the same millisecond, since that is not yet afterwards", () => {
    expect(
      afterSending([queued(5, THE_TURN_ENDED)], alreadySent(THE_TURN_ENDED, NOW - 5 * MINUTE))
        .deliver
    ).toEqual([THE_TURN_ENDED]);
  });

  it("counts a send stamped this very millisecond, which is a delivery like any other", () => {
    const ping = queued(5, THE_TURN_ENDED);
    const selection = afterSending([ping], alreadySent(THE_TURN_ENDED, NOW));

    expect(selection.deliver).toEqual([]);
    expect(selection.dropped).toEqual([{ kind: DROP.repeat, ping }]);
  });

  it("ignores a send stamped in the future, which is a broken clock rather than a delivery", () => {
    expect(
      afterSending([queued(5, THE_TURN_ENDED)], alreadySent(THE_TURN_ENDED, NOW + MINUTE)).deliver
    ).toEqual([THE_TURN_ENDED]);
  });

  it("looks the send up under the project, not the whole message", () => {
    expect(
      afterSending([queued(5, "[b] the turn ended")], alreadySent(THE_TURN_ENDED, NOW - 2 * MINUTE))
        .deliver
    ).toEqual(["[b] the turn ended"]);
  });

  it("counts the keyboard first, so the reason logged is the one the user would recognise", () => {
    const selection = selectPending([queued(5, THE_TURN_ENDED)], {
      now: NOW,
      staleMinutes: STALE_MINUTES,
      lastInputAt: NOW - 3 * MINUTE,
      sessionsThatMustWait: NOBODY_WAITS,
      sentPerProject: alreadySent(THE_TURN_ENDED, NOW - 2 * MINUTE),
    });

    expect(selection.dropped).toEqual([{ kind: DROP.seen, ping: queued(5, THE_TURN_ENDED) }]);
  });
});

describe("projectsIn", () => {
  it("collects every project worth a last-sent lookup, once", () => {
    expect(
      projectsIn([queued(1, "[a] one"), queued(1, "[a@home] two"), queued(1, "[b] three")])
    ).toEqual(["a", "b"]);
  });

  it("names the catch-all for a ping with no project at all", () => {
    expect(projectsIn([queued(1, "no prefix")])).toEqual(["global"]);
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
