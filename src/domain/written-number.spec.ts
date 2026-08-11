import { describe, expect, it } from "vitest";

import { numberIn, numberOr } from "#domain/written-number.ts";


const FALLBACK = 3;

describe("numberIn", () => {
  it("reads a number somebody typed", () => {
    expect(numberIn("42")).toBe(42);
  });

  it("reads a negative one", () => {
    expect(numberIn("-7")).toBe(-7);
  });

  it("reads zero as zero rather than as nothing, since zero is a setting", () => {
    expect(numberIn("0")).toBe(0);
  });

  it("reads it as decimal, so a padded 09 is nine and not an error", () => {
    expect(numberIn("09")).toBe(9);
  });

  it("has nothing to report for a word", () => {
    expect(numberIn("soon")).toBeNull();
  });

  it("has nothing to report for an empty setting", () => {
    expect(numberIn("")).toBeNull();
  });

  it("has nothing to report for a setting that is not there", () => {
    expect(numberIn(undefined)).toBeNull();
  });
});

describe("numberOr", () => {
  it("prefers what was written", () => {
    expect(numberOr("20", FALLBACK)).toBe(20);
  });

  it("falls back when nothing was written", () => {
    expect(numberOr(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("treats a number it cannot read as absent rather than as zero", () => {
    expect(numberOr("soon", FALLBACK)).toBe(FALLBACK);
  });

  it("keeps a written zero, because zero turns a feature off", () => {
    expect(numberOr("0", FALLBACK)).toBe(0);
  });
});
