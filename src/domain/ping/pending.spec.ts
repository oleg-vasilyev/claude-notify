import { describe, expect, it } from "vitest";

import { DROP, selectPending, transcriptPathsIn, type PendingPing } from "#domain/ping/pending.ts";


const NOW = Date.parse("2026-08-07T12:00:00Z");
const MINUTE = 60_000;
const SECOND = 1_000;
const STALE_MINUTES = 15;
const SETTLING_SECONDS = 5;
const TRANSCRIPT = "C:\\sessions\\one.jsonl";

const queued = (minutesAgo: number, message: string): PendingPing => ({
  queuedAt: NOW - minutesAgo * MINUTE,
  message,
  transcriptPath: null,
});

const followed = (ping: PendingPing, transcriptPath: string): PendingPing => ({
  ...ping,
  transcriptPath,
});

const select = (pending: PendingPing[], transcriptModifiedAt = new Map<string, number>()) =>
  selectPending(pending, { now: NOW, staleMinutes: STALE_MINUTES, transcriptModifiedAt });

describe("selectPending", () => {
  it("delivers a fresh ping", () => {
    const selection = select([queued(5, "[a] hello")]);

    expect(selection.deliver).toEqual(["[a] hello"]);
    expect(selection.dropped).toEqual([]);
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

describe("selectPending, when the session it describes has moved on", () => {
  const ping = followed(queued(9, "[a] the turn ended"), TRANSCRIPT);

  const withTranscriptWrittenAt = (at: number) => select([ping], new Map([[TRANSCRIPT, at]]));

  it("drops a ping whose transcript grew after it was queued", () => {
    const selection = withTranscriptWrittenAt(NOW - MINUTE);

    expect(selection.deliver).toEqual([]);
    expect(selection.dropped).toEqual([{ kind: DROP.movedOn, ping }]);
  });

  it("keeps a ping whose transcript has not moved since", () => {
    expect(withTranscriptWrittenAt(ping.queuedAt).deliver).toEqual(["[a] the turn ended"]);
  });

  it("keeps a ping through the writes the hook's own turn causes", () => {
    const settled = ping.queuedAt + SETTLING_SECONDS * SECOND;

    expect(withTranscriptWrittenAt(settled).deliver).toEqual(["[a] the turn ended"]);
    expect(withTranscriptWrittenAt(settled + SECOND).deliver).toEqual([]);
  });

  it("keeps a ping whose transcript could not be read at all", () => {
    expect(select([ping]).deliver).toEqual(["[a] the turn ended"]);
  });

  it("keeps a ping that carries no transcript, since nothing says it moved on", () => {
    const byHand = queued(9, "[a] waiting on you");

    expect(select([byHand], new Map([[TRANSCRIPT, NOW]])).deliver).toEqual(["[a] waiting on you"]);
  });

  it("prefers staleness as the reason when a ping is both stale and left behind", () => {
    const old = followed(queued(20, "[a] old news"), TRANSCRIPT);

    expect(select([old], new Map([[TRANSCRIPT, NOW]])).dropped).toEqual([
      { kind: DROP.stale, ping: old },
    ]);
  });

  it("lets a project's other session still be delivered", () => {
    const other = followed(queued(2, "[a] another session is waiting"), "C:\\sessions\\two.jsonl");

    expect(select([ping, other], new Map([[TRANSCRIPT, NOW]])).deliver).toEqual([
      "[a] another session is waiting",
    ]);
  });
});

describe("transcriptPathsIn", () => {
  it("collects every transcript worth asking about, once", () => {
    const paths = transcriptPathsIn([
      followed(queued(1, "[a] one"), TRANSCRIPT),
      followed(queued(1, "[a] two"), TRANSCRIPT),
      queued(1, "[b] three"),
      followed(queued(1, "[b] four"), "C:\\sessions\\two.jsonl"),
    ]);

    expect(paths).toEqual([TRANSCRIPT, "C:\\sessions\\two.jsonl"]);
  });

  it("asks about nothing when no ping carries a transcript", () => {
    expect(transcriptPathsIn([queued(1, "[a] one")])).toEqual([]);
  });
});
