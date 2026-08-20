import { describe, expect, it } from "vitest";

import {
  readoutFor,
  usageBlock,
  type UsageLimit,
  type UsageSnapshot,
} from "#domain/ping/usage.ts";


const NOW = new Date("2026-08-07T12:00:00Z");
const AN_HOUR_FROM_NOW = "2026-08-07T13:00:00Z";
const TWO_HOURS_FROM_NOW = "2026-08-07T14:00:00Z";
const AN_HOUR_AGO = "2026-08-07T11:00:00Z";
const BAR_SEGMENTS = 10;
const FRESH = 0;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const session = (percent: number, resets?: string): UsageLimit => ({
  group: "session",
  percent,
  resets_at: resets ?? null,
});

const weekly = (percent: number, model?: string, resets?: string): UsageLimit => ({
  group: "weekly",
  percent,
  resets_at: resets ?? null,
  scope: model === undefined ? null : { model: { display_name: model } },
});

const snapshot = (limits: UsageLimit[]): UsageSnapshot => ({ limits });

const rows = (block: string): string[] => block.split("\n");
const barOf = (row: string): string => row.split("  ")[1] ?? "";

describe("usageBlock, when the snapshot is not fresh", () => {
  const three = snapshot([session(24), weekly(26), weekly(23, "Fable")]);

  it("says how old the reading is, so no number pretends to be current", () => {
    expect(usageBlock(three, NOW, 40 * MINUTE)).toContain("40m old");
  });

  it("says nothing about age while the reading is current", () => {
    expect(usageBlock(three, NOW, FRESH)).not.toContain("old");
  });

  it("puts the rows first, then what resets, then how old the reading is", () => {
    expect(usageBlock(snapshot([session(92, AN_HOUR_FROM_NOW)]), NOW, 40 * MINUTE)).toBe(
      "5-hour  ━━━━━━━━━─   92%\n5-hour resets in 1h\n40m old"
    );
  });

  it("drops a busy window's countdown with the row it belongs to, since both stand on the same stale percent", () => {
    const block = usageBlock(
      snapshot([session(92, AN_HOUR_FROM_NOW), weekly(30)]),
      NOW,
      76 * MINUTE
    );

    expect(block).not.toContain("resets");
    expect(block).toContain("weekly");
  });

  it("keeps the five-hour row while a quarter of its window has not passed", () => {
    expect(usageBlock(three, NOW, 74 * MINUTE)).toContain("5-hour");
  });

  it("keeps the row at exactly a quarter, since the rule is older-than", () => {
    expect(usageBlock(three, NOW, 75 * MINUTE)).toContain("5-hour");
  });

  it("drops the five-hour row once the reading is older than a quarter of five hours", () => {
    const block = usageBlock(three, NOW, 76 * MINUTE);

    expect(block).not.toContain("5-hour");
    expect(block).toContain("weekly");
  });

  it("keeps a weekly row far longer, since a week barely moves in a morning", () => {
    expect(usageBlock(three, NOW, 12 * HOUR)).toContain("weekly");
  });

  it("drops even the weekly rows once a reading is older than a quarter of a week", () => {
    expect(usageBlock(three, NOW, 43 * HOUR)).toBe("");
  });

  it("realigns the columns around whatever rows survived", () => {
    const left = rows(usageBlock(three, NOW, 2 * HOUR));

    expect(left[0]?.startsWith("weekly  ")).toBe(true);
    expect(left[1]?.startsWith("fable   ")).toBe(true);
  });
});

describe("usageBlock", () => {
  it("draws a row per window, in columns a monospace block can align", () => {
    expect(usageBlock(snapshot([session(24), weekly(26), weekly(23, "Fable")]), NOW, FRESH)).toBe(
      ["5-hour  ━━────────   24%", "weekly  ━━━───────   26%", "fable   ━━────────   23%"].join("\n")
    );
  });

  it("shows every weekly window rather than only the busiest, so no row changes identity", () => {
    const block = usageBlock(snapshot([session(10), weekly(53), weekly(54, "Fable")]), NOW, FRESH);

    expect(rows(block)).toHaveLength(3);
    expect(block).toContain("weekly");
    expect(block).toContain("fable");
  });

  it("names a window after the model it is scoped to, whatever that model is", () => {
    expect(usageBlock(snapshot([weekly(54, "Sonnet")]), NOW, FRESH)).toContain("sonnet");
  });

  it("pads the label column to the longest name", () => {
    const block = usageBlock(snapshot([session(10), weekly(20, "Fable")]), NOW, FRESH);

    expect(rows(block)[0]?.startsWith("5-hour  ")).toBe(true);
    expect(rows(block)[1]?.startsWith("fable   ")).toBe(true);
  });

  it("right-aligns the share so the digits line up at any width", () => {
    const block = usageBlock(snapshot([session(9), weekly(100)]), NOW, FRESH);

    expect(rows(block)[0]?.endsWith("   9%")).toBe(true);
    expect(rows(block)[1]?.endsWith(" 100%")).toBe(true);
  });

  it("says when a busy window resets on a line of its own, since a wrapped row loses its columns", () => {
    expect(usageBlock(snapshot([session(92, AN_HOUR_FROM_NOW)]), NOW, FRESH)).toBe(
      "5-hour  ━━━━━━━━━─   92%\n5-hour resets in 1h"
    );
  });

  it("names the window in the reset line, since two of them can be busy at once", () => {
    const block = usageBlock(
      snapshot([session(92, AN_HOUR_FROM_NOW), weekly(88, undefined, TWO_HOURS_FROM_NOW)]),
      NOW,
      FRESH
    );

    expect(rows(block).slice(2)).toEqual(["5-hour resets in 1h", "weekly resets in 2h"]);
  });

  it("stays quiet about the reset while a window is roomy", () => {
    expect(usageBlock(snapshot([session(79, AN_HOUR_FROM_NOW)]), NOW, FRESH)).toBe(
      "5-hour  ━━━━━━━━──   79%"
    );
  });

  it("counts eighty as busy", () => {
    expect(usageBlock(snapshot([session(80, AN_HOUR_FROM_NOW)]), NOW, FRESH)).toContain(
      "5-hour resets in 1h"
    );
  });

  it("says nothing about a reset landing exactly now, since the window has already turned", () => {
    expect(usageBlock(snapshot([session(92, NOW.toISOString())]), NOW, FRESH)).toBe(
      "5-hour  ━━━━━━━━━─   92%"
    );
  });

  it("says nothing about a reset already in the past", () => {
    expect(usageBlock(snapshot([session(92, AN_HOUR_AGO)]), NOW, FRESH)).toBe("5-hour  ━━━━━━━━━─   92%");
  });

  it("says nothing about a reset it cannot read", () => {
    expect(usageBlock(snapshot([session(92, "not a date")]), NOW, FRESH)).toBe(
      "5-hour  ━━━━━━━━━─   92%"
    );
  });

  it("rounds the share rather than printing a fraction", () => {
    expect(usageBlock(snapshot([session(33.4)]), NOW, FRESH)).toContain("  33%");
  });

  it("fills the bar only at a hundred", () => {
    expect(barOf(usageBlock(snapshot([session(100)]), NOW, FRESH))).toBe("━".repeat(BAR_SEGMENTS));
  });

  it("empties the bar only at nothing spent", () => {
    expect(barOf(usageBlock(snapshot([session(0)]), NOW, FRESH))).toBe("─".repeat(BAR_SEGMENTS));
  });

  it("shows a sliver rather than nothing once anything is spent", () => {
    expect(barOf(usageBlock(snapshot([session(2)]), NOW, FRESH))).toBe(`━${"─".repeat(BAR_SEGMENTS - 1)}`);
  });

  it("keeps a gap rather than a full bar just short of the whole", () => {
    expect(barOf(usageBlock(snapshot([session(97)]), NOW, FRESH))).toBe(
      `${"━".repeat(BAR_SEGMENTS - 1)}─`
    );
  });

  it("falls back to the flat windows when no limits are named", () => {
    const flat: UsageSnapshot = {
      limits: [],
      five_hour: { utilization: 10, resets_at: null },
      seven_day: { utilization: 20, resets_at: null },
    };

    expect(usageBlock(flat, NOW, FRESH)).toBe(["5-hour  ━─────────   10%", "weekly  ━━────────   20%"].join("\n"));
  });

  it("prefers the named limits when both shapes arrive", () => {
    const both: UsageSnapshot = {
      limits: [session(10)],
      five_hour: { utilization: 99, resets_at: null },
      seven_day: null,
    };

    expect(usageBlock(both, NOW, FRESH)).toBe("5-hour  ━─────────   10%");
  });

  it("says nothing at all when there is nothing to read", () => {
    expect(usageBlock(null, NOW, FRESH)).toBe("");
    expect(usageBlock({ limits: [], five_hour: null, seven_day: null }, NOW, FRESH)).toBe("");
  });

  it("skips a window with no share, rather than drawing an empty row", () => {
    expect(usageBlock(snapshot([{ group: "session", percent: null }, weekly(53)]), NOW, FRESH)).toBe(
      "weekly  ━━━━━─────   53%"
    );
  });

  it("ignores a window group it does not know", () => {
    expect(usageBlock(snapshot([{ group: "monthly", percent: 99 }, session(33)]), NOW, FRESH)).toBe(
      "5-hour  ━━━───────   33%"
    );
  });
});

describe("readoutFor", () => {
  const three = snapshot([session(24), weekly(26), weekly(23, "Fable")]);
  const arrived = { kind: "read", snapshot: three } as const;
  const refused = { kind: "unavailable", why: "the endpoint answered 401" } as const;
  const kept = (agoMs: number) => ({ snapshot: three, readAt: NOW.getTime() - agoMs });

  it("shows what just arrived, says nothing, and keeps it", () => {
    const readout = readoutFor(arrived, null, NOW);

    expect(readout.block).toContain("5-hour");
    expect(readout.warning).toBe("");
    expect(readout.remember).toBe(three);
  });

  it("keeps nothing when the endpoint answered with no windows at all", () => {
    const readout = readoutFor({ kind: "read", snapshot: { limits: [] } }, null, NOW);

    expect(readout.remember).toBeNull();
    expect(readout.warning).toContain("named no limit windows");
  });

  it("falls back to what was kept, and says how old it is", () => {
    const readout = readoutFor(refused, kept(40 * MINUTE), NOW);

    expect(readout.block).toContain("40m old");
    expect(readout.warning).toBe("usage from a snapshot 40m old: the endpoint answered 401");
    expect(readout.remember).toBeNull();
  });

  it("shows nothing when there is nothing kept to fall back on", () => {
    const readout = readoutFor(refused, null, NOW);

    expect(readout.block).toBe("");
    expect(readout.warning).toBe("usage unavailable: the endpoint answered 401");
  });

  it("refuses a reading dated in the future rather than dressing it as current", () => {
    const readout = readoutFor(refused, kept(-HOUR), NOW);

    expect(readout.block).toBe("");
    expect(readout.warning).toContain("dated in the future");
  });

  it("says the reading was too old when age is what emptied the block", () => {
    expect(readoutFor(refused, kept(3 * 24 * HOUR), NOW).warning).toContain("too old to show");
  });

  it("says the reading named no windows when that is what emptied it, not age", () => {
    const empty = { snapshot: { limits: [] }, readAt: NOW.getTime() - MINUTE };

    expect(readoutFor(refused, empty, NOW).warning).toContain("named no limit windows");
  });
});
