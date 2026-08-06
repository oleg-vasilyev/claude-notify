import { describe, expect, it } from "vitest";

import { flattenPayload } from "#state/log.ts";


const KEPT_CHARACTERS = 400;

describe("flattenPayload", () => {
  it("puts a multi-line payload on one line", () => {
    expect(flattenPayload('{\n  "cwd": "D:\\\\Temp"\n}')).toBe('{ "cwd": "D:\\\\Temp" }');
  });

  it("keeps a short payload whole", () => {
    expect(flattenPayload('{"a":1}')).toBe('{"a":1}');
  });

  it("truncates a long payload and says how long it was", () => {
    const long = "x".repeat(1000);

    expect(flattenPayload(long)).toBe(`${"x".repeat(KEPT_CHARACTERS)}... (1000 chars)`);
  });

  it("keeps a payload that is exactly at the limit", () => {
    const exact = "x".repeat(KEPT_CHARACTERS);

    expect(flattenPayload(exact)).toBe(exact);
  });

  it("handles an empty payload", () => {
    expect(flattenPayload("")).toBe("");
  });
});
