import { describe, expect, it } from "vitest";

import { usageBlock, type UsageLimit, type UsageSnapshot } from "#domain/ping/usage.ts";


const NOW = new Date("2026-08-07T12:00:00Z");
const AN_HOUR_FROM_NOW = "2026-08-07T13:00:00Z";
const AN_HOUR_AGO = "2026-08-07T11:00:00Z";
const BAR_SEGMENTS = 10;

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

describe("usageBlock", () => {
  it("draws a row per window, in columns a monospace block can align", () => {
    expect(usageBlock(snapshot([session(24), weekly(26), weekly(23, "Fable")]), NOW)).toBe(
      ["5-hour  ━━────────   24%", "weekly  ━━━───────   26%", "fable   ━━────────   23%"].join("\n")
    );
  });

  it("shows every weekly window rather than only the busiest, so no row changes identity", () => {
    const block = usageBlock(snapshot([session(10), weekly(53), weekly(54, "Fable")]), NOW);

    expect(rows(block)).toHaveLength(3);
    expect(block).toContain("weekly");
    expect(block).toContain("fable");
  });

  it("names a window after the model it is scoped to, whatever that model is", () => {
    expect(usageBlock(snapshot([weekly(54, "Sonnet")]), NOW)).toContain("sonnet");
  });

  it("pads the label column to the longest name", () => {
    const block = usageBlock(snapshot([session(10), weekly(20, "Fable")]), NOW);

    expect(rows(block)[0]?.startsWith("5-hour  ")).toBe(true);
    expect(rows(block)[1]?.startsWith("fable   ")).toBe(true);
  });

  it("right-aligns the share so the digits line up at any width", () => {
    const block = usageBlock(snapshot([session(9), weekly(100)]), NOW);

    expect(rows(block)[0]?.endsWith("   9%")).toBe(true);
    expect(rows(block)[1]?.endsWith(" 100%")).toBe(true);
  });

  it("says when a busy window resets, since that is when it starts to matter", () => {
    expect(usageBlock(snapshot([session(92, AN_HOUR_FROM_NOW)]), NOW)).toBe(
      "5-hour  ━━━━━━━━━─   92%  1h"
    );
  });

  it("stays quiet about the reset while a window is roomy", () => {
    expect(usageBlock(snapshot([session(79, AN_HOUR_FROM_NOW)]), NOW)).toBe(
      "5-hour  ━━━━━━━━──   79%"
    );
  });

  it("counts eighty as busy", () => {
    expect(usageBlock(snapshot([session(80, AN_HOUR_FROM_NOW)]), NOW)).toContain("1h");
  });

  it("says nothing about a reset already in the past", () => {
    expect(usageBlock(snapshot([session(92, AN_HOUR_AGO)]), NOW)).toBe("5-hour  ━━━━━━━━━─   92%");
  });

  it("says nothing about a reset it cannot read", () => {
    expect(usageBlock(snapshot([session(92, "not a date")]), NOW)).toBe(
      "5-hour  ━━━━━━━━━─   92%"
    );
  });

  it("rounds the share rather than printing a fraction", () => {
    expect(usageBlock(snapshot([session(33.4)]), NOW)).toContain("  33%");
  });

  it("fills the bar only at a hundred", () => {
    expect(barOf(usageBlock(snapshot([session(100)]), NOW))).toBe("━".repeat(BAR_SEGMENTS));
  });

  it("empties the bar only at nothing spent", () => {
    expect(barOf(usageBlock(snapshot([session(0)]), NOW))).toBe("─".repeat(BAR_SEGMENTS));
  });

  it("shows a sliver rather than nothing once anything is spent", () => {
    expect(barOf(usageBlock(snapshot([session(2)]), NOW))).toBe(`━${"─".repeat(BAR_SEGMENTS - 1)}`);
  });

  it("keeps a gap rather than a full bar just short of the whole", () => {
    expect(barOf(usageBlock(snapshot([session(97)]), NOW))).toBe(
      `${"━".repeat(BAR_SEGMENTS - 1)}─`
    );
  });

  it("falls back to the flat windows when no limits are named", () => {
    const flat: UsageSnapshot = {
      limits: [],
      five_hour: { utilization: 10, resets_at: null },
      seven_day: { utilization: 20, resets_at: null },
    };

    expect(usageBlock(flat, NOW)).toBe(["5-hour  ━─────────   10%", "weekly  ━━────────   20%"].join("\n"));
  });

  it("prefers the named limits when both shapes arrive", () => {
    const both: UsageSnapshot = {
      limits: [session(10)],
      five_hour: { utilization: 99, resets_at: null },
      seven_day: null,
    };

    expect(usageBlock(both, NOW)).toBe("5-hour  ━─────────   10%");
  });

  it("says nothing at all when there is nothing to read", () => {
    expect(usageBlock(null, NOW)).toBe("");
    expect(usageBlock({ limits: [], five_hour: null, seven_day: null }, NOW)).toBe("");
  });

  it("skips a window with no share, rather than drawing an empty row", () => {
    expect(usageBlock(snapshot([{ group: "session", percent: null }, weekly(53)]), NOW)).toBe(
      "weekly  ━━━━━─────   53%"
    );
  });

  it("ignores a window group it does not know", () => {
    expect(usageBlock(snapshot([{ group: "monthly", percent: 99 }, session(33)]), NOW)).toBe(
      "5-hour  ━━━───────   33%"
    );
  });
});
