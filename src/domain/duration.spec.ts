import { describe, expect, it } from "vitest";

import { humanizeDuration } from "#domain/duration.ts";


const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("humanizeDuration", () => {
  it("reports minutes under an hour", () => {
    expect(humanizeDuration(12 * MINUTE)).toBe("12 мин");
  });

  it("reports hours and minutes together", () => {
    expect(humanizeDuration(HOUR + 12 * MINUTE)).toBe("1 ч 12 мин");
  });

  it("drops a zero minute part", () => {
    expect(humanizeDuration(2 * HOUR)).toBe("2 ч");
  });

  it("has a floor below one minute", () => {
    expect(humanizeDuration(20_000)).toBe("меньше минуты");
  });

  it("treats a zero span as below the floor", () => {
    expect(humanizeDuration(0)).toBe("меньше минуты");
  });

  it("rounds a part-minute down rather than up", () => {
    expect(humanizeDuration(2 * MINUTE - 1)).toBe("1 мин");
  });
});
