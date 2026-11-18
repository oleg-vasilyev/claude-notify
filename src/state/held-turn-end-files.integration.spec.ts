import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { HeldTurnEnd } from "#domain/ping/held-turn-end.ts";
import { forgetHeldTurnEnd, holdTurnEnd, readHeldTurnEnds } from "#state/held-turn-end-files.ts";


const state = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: at } = require("node:path") as typeof import("node:path");

  return mkdtempSync(at(tmpdir(), "claude-notify-held-"));
});

vi.mock("#state/file-locations.ts", () => ({
  HELD_TURN_END_PREFIX: "held-turn-end-",
  stateHome: () => state,
  heldTurnEndFile: (sessionId: string) => join(state, `held-turn-end-${sessionId}.json`),
}));

const HELD_AT = 1_763_459_245_000;

const heldFor = (sessionId: string): HeldTurnEnd => ({
  sessionId,
  heldAt: HELD_AT,
  transcriptPath: "C:\\sessions\\one.jsonl",
  ping: { message: "[a-project] закончил ход, ждёт тебя", rateLimitMinutes: 10 },
});

describe("held turn ends", () => {
  beforeEach(() => {
    for (const name of readdirSync(state)) {
      rmSync(join(state, name), { force: true });
    }
  });

  afterAll(() => {
    rmSync(state, { recursive: true, force: true });
  });

  it("reads back a held turn end exactly as it was held", () => {
    holdTurnEnd(heldFor("one"));

    expect(readHeldTurnEnds()).toEqual([heldFor("one")]);
  });

  it("keeps one per session, so a later hold replaces the earlier", () => {
    holdTurnEnd(heldFor("one"));
    holdTurnEnd({ ...heldFor("one"), heldAt: HELD_AT + 1 });

    expect(readHeldTurnEnds()).toEqual([{ ...heldFor("one"), heldAt: HELD_AT + 1 }]);
  });

  it("keeps every session's hold apart", () => {
    holdTurnEnd(heldFor("one"));
    holdTurnEnd(heldFor("two"));

    expect(readHeldTurnEnds().map((held) => held.sessionId).sort()).toEqual(["one", "two"]);
  });

  it("forgets a hold once it is settled", () => {
    holdTurnEnd(heldFor("one"));

    forgetHeldTurnEnd(heldFor("one"));

    expect(readHeldTurnEnds()).toEqual([]);
  });

  it("keeps a newer hold that replaced the one being forgotten, so a fresh net is not lost", () => {
    const newer = { ...heldFor("one"), heldAt: HELD_AT + 1 };

    holdTurnEnd(newer);
    forgetHeldTurnEnd(heldFor("one"));

    expect(readHeldTurnEnds()).toEqual([newer]);
  });

  it("forgets a hold that was never there without complaint", () => {
    expect(() => {
      forgetHeldTurnEnd(heldFor("never-held"));
    }).not.toThrow();
  });

  it("ignores every other file in the state folder", () => {
    writeFileSync(join(state, "pending.jsonl"), "{}\n", "utf8");

    expect(readHeldTurnEnds()).toEqual([]);
  });

  it.each([
    ["will not parse", "{ cut in half"],
    ["parses into null", "null"],
    ["lacks its session", JSON.stringify({ ...heldFor("one"), sessionId: 7 })],
    ["lacks its ping", JSON.stringify({ ...heldFor("one"), ping: null })],
    ["carries a ping with no message", JSON.stringify({ ...heldFor("one"), ping: { rateLimitMinutes: 10 } })],
  ])("drops and deletes a hold that %s, so one bad file cannot strand the rest", (_why, text) => {
    const path = join(state, "held-turn-end-broken.json");

    writeFileSync(path, text, "utf8");
    holdTurnEnd(heldFor("one"));

    expect(readHeldTurnEnds()).toEqual([heldFor("one")]);
    expect(existsSync(path)).toBe(false);
  });

  it("reads a hold that lost its transcript as having none", () => {
    writeFileSync(
      join(state, "held-turn-end-one.json"),
      JSON.stringify({ ...heldFor("one"), transcriptPath: 7 }),
      "utf8"
    );

    expect(readHeldTurnEnds()).toEqual([{ ...heldFor("one"), transcriptPath: null }]);
  });
});
