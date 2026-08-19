import { describe, expect, it } from "vitest";

import { humanizeDuration } from "#domain/duration.ts";


const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("humanizeDuration", () => {
  it("counts whole hours and minutes", () => {
    expect(humanizeDuration(4 * HOUR + 2 * MINUTE)).toBe("4h 2m");
  });

  it("drops the minutes when there are none", () => {
    expect(humanizeDuration(3 * HOUR)).toBe("3h");
  });

  it("counts minutes alone under an hour", () => {
    expect(humanizeDuration(25 * MINUTE)).toBe("25m");
  });

  it("rounds down rather than up, so a countdown never overpromises", () => {
    expect(humanizeDuration(25 * MINUTE + 59 * SECOND)).toBe("25m");
  });

  it("says less than a minute rather than zero", () => {
    expect(humanizeDuration(30 * SECOND)).toBe("<1m");
  });

  it("says less than a minute for nothing at all", () => {
    expect(humanizeDuration(0)).toBe("<1m");
  });
});
