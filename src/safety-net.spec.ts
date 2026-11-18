import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HeldTurnEnd } from "#domain/ping/held-turn-end.ts";
import { SESSION_ACTIVITY, type SessionNote } from "#domain/ping/session-activity.ts";
import { playSound } from "#sound/play-sound.ts";
import { forgetHeldTurnEnd, readHeldTurnEnds } from "#state/held-turn-end-files.ts";
import { log } from "#state/log.ts";
import { readSessionNote, writeSessionNote } from "#state/session-note.ts";
import { deliver } from "#app/deliver.ts";
import { settleHeldTurnEnds } from "#app/safety-net.ts";


vi.mock("#sound/play-sound.ts", () => ({ playSound: vi.fn() }));
vi.mock("#state/held-turn-end-files.ts", () => ({
  forgetHeldTurnEnd: vi.fn(),
  readHeldTurnEnds: vi.fn(),
}));
vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#state/session-note.ts", () => ({ readSessionNote: vi.fn(), writeSessionNote: vi.fn() }));
vi.mock("#app/deliver.ts", () => ({ deliver: vi.fn() }));

const HELD_AT = Date.parse("2026-11-18T09:47:25Z");
const MINUTE = 60_000;
const SAFETY_NET_MINUTES = 30;
const QUIET_LONG_ENOUGH = HELD_AT + SAFETY_NET_MINUTES * MINUTE;
const NOT_YET = HELD_AT + MINUTE;
const TRANSCRIPT = "C:\\sessions\\one.jsonl";

const heldFor = (sessionId: string): HeldTurnEnd => ({
  sessionId,
  heldAt: HELD_AT,
  transcriptPath: TRANSCRIPT,
  ping: { message: "[a-project] закончил ход, ждёт тебя", rateLimitMinutes: 10 },
});

const quietSince = (at: number): SessionNote => ({
  activity: { kind: SESSION_ACTIVITY.working },
  transcriptPath: TRANSCRIPT,
  at,
});

describe("settleHeldTurnEnds", () => {
  beforeEach(() => {
    vi.mocked(readHeldTurnEnds).mockReturnValue([heldFor("one")]);
    vi.mocked(readSessionNote).mockReturnValue(quietSince(HELD_AT));
    vi.mocked(deliver).mockResolvedValue({ outcome: { kind: "sent" }, picture: null });
  });

  it("rings with the turn-ended sound once the session has been quiet long enough", async () => {
    await settleHeldTurnEnds(QUIET_LONG_ENOUGH);

    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith("turnEnded");
  });

  it("sends the held ping through the usual funnel, raised the moment it rang", async () => {
    await settleHeldTurnEnds(QUIET_LONG_ENOUGH);

    expect(deliver).toHaveBeenCalledWith({
      ...heldFor("one").ping,
      sessionId: "one",
      raisedAt: QUIET_LONG_ENOUGH,
    });
  });

  it("marks the session as waiting, so a ping queued for it may go out", async () => {
    await settleHeldTurnEnds(QUIET_LONG_ENOUGH);

    expect(writeSessionNote).toHaveBeenCalledWith("one", {
      activity: { kind: SESSION_ACTIVITY.waitingAtTurnEnd },
      transcriptPath: TRANSCRIPT,
      at: QUIET_LONG_ENOUGH,
    });
  });

  it("forgets the hold it rang for, so it rings once", async () => {
    await settleHeldTurnEnds(QUIET_LONG_ENOUGH);

    expect(forgetHeldTurnEnd).toHaveBeenCalledWith(heldFor("one"));
  });

  it("logs the sound and why it came", async () => {
    await settleHeldTurnEnds(QUIET_LONG_ENOUGH);

    expect(log).toHaveBeenCalledWith(
      "SOUND turnEnded | the safety net, nothing happened since a held turn end"
    );
  });

  it("says nothing is held once it rang", async () => {
    expect(await settleHeldTurnEnds(QUIET_LONG_ENOUGH)).toBe(false);
  });

  it("keeps waiting, silently, while the quiet is shorter than the net", async () => {
    expect(await settleHeldTurnEnds(NOT_YET)).toBe(true);
    expect(playSound).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    expect(forgetHeldTurnEnd).not.toHaveBeenCalled();
  });

  it("forgets a hold that something newer superseded, without a sound", async () => {
    vi.mocked(readSessionNote).mockReturnValue(quietSince(HELD_AT + MINUTE));

    expect(await settleHeldTurnEnds(QUIET_LONG_ENOUGH)).toBe(false);
    expect(forgetHeldTurnEnd).toHaveBeenCalledWith(heldFor("one"));
    expect(playSound).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("reads each hold's own session", async () => {
    await settleHeldTurnEnds(NOT_YET);

    expect(readSessionNote).toHaveBeenCalledWith("one");
  });

  it("says something is still held while any one hold waits", async () => {
    vi.mocked(readHeldTurnEnds).mockReturnValue([heldFor("one"), heldFor("two")]);
    vi.mocked(readSessionNote)
      .mockReturnValueOnce(quietSince(HELD_AT))
      .mockReturnValueOnce(quietSince(HELD_AT + MINUTE));

    expect(await settleHeldTurnEnds(NOT_YET)).toBe(true);
  });

  it("says nothing is held when there is nothing to hold", async () => {
    vi.mocked(readHeldTurnEnds).mockReturnValue([]);

    expect(await settleHeldTurnEnds(QUIET_LONG_ENOUGH)).toBe(false);
  });

  it("settles the next hold when one fails, and says which failed", async () => {
    vi.mocked(readHeldTurnEnds).mockReturnValue([heldFor("one"), heldFor("two")]);
    vi.mocked(deliver).mockRejectedValueOnce(new Error("disk full"));

    await settleHeldTurnEnds(QUIET_LONG_ENOUGH);

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "WARN a held turn end could not be settled: Error: disk full | [a-project] закончил ход, ждёт тебя"
    );
  });

  it("still counts a hold that waits after one that failed", async () => {
    const LATER = HELD_AT + MINUTE;
    const younger = { ...heldFor("two"), heldAt: LATER };

    vi.mocked(readHeldTurnEnds).mockReturnValue([heldFor("one"), younger]);
    vi.mocked(readSessionNote)
      .mockReturnValueOnce(quietSince(HELD_AT))
      .mockReturnValueOnce(quietSince(LATER));
    vi.mocked(deliver).mockRejectedValueOnce(new Error("disk full"));

    expect(await settleHeldTurnEnds(QUIET_LONG_ENOUGH)).toBe(true);
  });
});
