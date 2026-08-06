import { describe, expect, it } from "vitest";

import { usageLine, type UsageLimit, type UsageSnapshot } from "#domain/usage.ts";


const NOW = new Date("2026-08-07T12:00:00Z");
const AN_HOUR_FROM_NOW = "2026-08-07T13:00:00+00:00";
const AN_HOUR_AGO = "2026-08-07T11:00:00+00:00";

const session = (percent: number, resetsAt: string | null = null): UsageLimit => ({
  group: "session",
  percent,
  resets_at: resetsAt,
});

const weekly = (percent: number, model: string | null = null): UsageLimit => ({
  group: "weekly",
  percent,
  resets_at: null,
  scope: model === null ? null : { model: { display_name: model } },
});

const snapshot = (limits: UsageLimit[]): UsageSnapshot => ({ limits });

describe("usageLine", () => {
  it("reports both windows", () => {
    expect(usageLine(snapshot([session(33), weekly(53)]), NOW)).toBe("5ч 33% · нед 53%");
  });

  it("names the model a weekly window is scoped to", () => {
    expect(usageLine(snapshot([session(33), weekly(54, "Fable")]), NOW)).toBe(
      "5ч 33% · нед/Fable 54%"
    );
  });

  it("shows the countdown once a window is nearly spent", () => {
    expect(usageLine(snapshot([session(92, AN_HOUR_FROM_NOW), weekly(53)]), NOW)).toBe(
      "5ч 92% (сброс через 1 ч) · нед 53%"
    );
  });

  it("stays quiet about a reset while there is plenty left", () => {
    expect(usageLine(snapshot([session(79, AN_HOUR_FROM_NOW)]), NOW)).toBe("5ч 79%");
  });

  it("shows the countdown at the threshold itself", () => {
    expect(usageLine(snapshot([session(80, AN_HOUR_FROM_NOW)]), NOW)).toBe(
      "5ч 80% (сброс через 1 ч)"
    );
  });

  it("drops a countdown whose reset has already passed", () => {
    expect(usageLine(snapshot([session(92, AN_HOUR_AGO)]), NOW)).toBe("5ч 92%");
  });

  it("drops a countdown it cannot read", () => {
    expect(usageLine(snapshot([session(92, "not a date")]), NOW)).toBe("5ч 92%");
  });

  it("picks the busiest of several weekly windows, since that is what stops the work", () => {
    expect(usageLine(snapshot([session(10), weekly(53), weekly(54, "Fable")]), NOW)).toBe(
      "5ч 10% · нед/Fable 54%"
    );
  });

  it("rounds a fractional percentage", () => {
    expect(usageLine(snapshot([session(33.4), weekly(53.6)]), NOW)).toBe("5ч 33% · нед 54%");
  });

  it("falls back to the flat shape when the limits array is absent", () => {
    const flat: UsageSnapshot = {
      five_hour: { utilization: 33 },
      seven_day: { utilization: 53 },
    };

    expect(usageLine(flat, NOW)).toBe("5ч 33% · нед 53%");
  });

  it("prefers the limits array over the flat shape", () => {
    const both: UsageSnapshot = {
      limits: [session(10), weekly(20)],
      five_hour: { utilization: 90 },
      seven_day: { utilization: 90 },
    };

    expect(usageLine(both, NOW)).toBe("5ч 10% · нед 20%");
  });

  it("reports what it has when only one window is known", () => {
    expect(usageLine(snapshot([session(33)]), NOW)).toBe("5ч 33%");
  });

  it("says nothing when the snapshot could not be fetched", () => {
    expect(usageLine(null, NOW)).toBe("");
  });

  it("says nothing when every window is empty", () => {
    expect(usageLine({ limits: [], five_hour: null, seven_day: null }, NOW)).toBe("");
  });

  it("ignores a window whose percentage is missing", () => {
    expect(usageLine(snapshot([{ group: "session", percent: null }, weekly(53)]), NOW)).toBe(
      "нед 53%"
    );
  });

  it("ignores a group it does not know about", () => {
    expect(usageLine(snapshot([{ group: "monthly", percent: 99 }, session(33)]), NOW)).toBe(
      "5ч 33%"
    );
  });
});
