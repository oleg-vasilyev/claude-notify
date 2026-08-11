import { describe, expect, it } from "vitest";

import { impossible } from "#domain/impossible.ts";


const reached = (value: unknown): (() => never) =>
  () =>
    impossible(value as never);

describe("impossible", () => {
  it("throws, because reaching it means a union grew a member nobody handled", () => {
    expect(reached({ kind: "carrier-pigeon" })).toThrow();
  });

  it("names the case that got through, since the type says it cannot exist", () => {
    expect(reached({ kind: "carrier-pigeon" })).toThrow("carrier-pigeon");
  });

  it("says what went wrong, since the reader is looking at a union that grew", () => {
    expect(reached({ kind: "carrier-pigeon" })).toThrow("a switch missed a case");
  });
});
