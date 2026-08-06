import { describe, expect, it } from "vitest";

import { parseEnvFile, withEnvValues } from "#domain/env-file.ts";


describe("parseEnvFile", () => {
  it("reads a key and its value", () => {
    expect(parseEnvFile("BOT_TOKEN=123:ABC")).toEqual({ BOT_TOKEN: "123:ABC" });
  });

  it("reads several lines", () => {
    expect(parseEnvFile("A=1\nB=2")).toEqual({ A: "1", B: "2" });
  });

  it("ignores comments and blank lines", () => {
    expect(parseEnvFile("# a note\n\nA=1\n   \n")).toEqual({ A: "1" });
  });

  it("keeps a value containing the separator, which every bot token does", () => {
    expect(parseEnvFile("BOT_TOKEN=7968:AAF-9mzx")).toEqual({ BOT_TOKEN: "7968:AAF-9mzx" });
  });

  it("trims the space people leave around the equals sign", () => {
    expect(parseEnvFile("  A = 1  ")).toEqual({ A: "1" });
  });

  it("strips quotes without eating the value", () => {
    expect(parseEnvFile('A="a value"\nB=\'other\'')).toEqual({ A: "a value", B: "other" });
  });

  it("keeps a quote that is part of the value", () => {
    expect(parseEnvFile("A=it's fine")).toEqual({ A: "it's fine" });
  });

  it("skips a line with no equals sign rather than throwing", () => {
    expect(parseEnvFile("nonsense\nA=1")).toEqual({ A: "1" });
  });

  it("skips a line with no key", () => {
    expect(parseEnvFile("=1\nA=2")).toEqual({ A: "2" });
  });

  it("allows an empty value, which is how a key is left unset", () => {
    expect(parseEnvFile("A=")).toEqual({ A: "" });
  });

  it("handles an empty file", () => {
    expect(parseEnvFile("")).toEqual({});
  });

  it("ignores a comment that is indented", () => {
    expect(parseEnvFile("   # indented\nA=1")).toEqual({ A: "1" });
  });

  it("ignores a line of only whitespace", () => {
    expect(parseEnvFile("\t \nA=1")).toEqual({ A: "1" });
  });

  it("does not treat a hash inside a value as a comment", () => {
    expect(parseEnvFile("A=red#green")).toEqual({ A: "red#green" });
  });

  it("keeps the last value when a key is written twice", () => {
    expect(parseEnvFile("A=1\nA=2")).toEqual({ A: "2" });
  });

  it("keeps an unmatched quote as part of the value", () => {
    expect(parseEnvFile('A="unterminated')).toEqual({ A: '"unterminated' });
  });

  it("does not strip quotes of different kinds", () => {
    expect(parseEnvFile("A=\"mixed'")).toEqual({ A: "\"mixed'" });
  });
});

describe("withEnvValues", () => {
  it("replaces the value of a key that is already there", () => {
    expect(withEnvValues("A=old\n", { A: "new" })).toBe("A=new\n");
  });

  it("keeps the comments a person wrote around their settings", () => {
    const written = "# what this is for\nA=old\n\n# and this\nB=keep\n";

    expect(withEnvValues(written, { A: "new" })).toBe(
      "# what this is for\nA=new\n\n# and this\nB=keep\n"
    );
  });

  it("appends a key the file did not have yet", () => {
    expect(withEnvValues("A=1\n", { B: "2" })).toBe("A=1\nB=2\n");
  });

  it("leaves keys it was not asked about alone", () => {
    expect(withEnvValues("A=1\nB=2\n", { A: "9" })).toBe("A=9\nB=2\n");
  });

  it("writes into an empty file", () => {
    expect(withEnvValues("", { A: "1" })).toBe("A=1\n");
  });

  it("updates and appends in one pass", () => {
    expect(withEnvValues("A=1\n", { A: "2", B: "3" })).toBe("A=2\nB=3\n");
  });

  it("round-trips through the parser", () => {
    expect(parseEnvFile(withEnvValues("", { BOT_TOKEN: "7968:AAF-9" }))).toEqual({
      BOT_TOKEN: "7968:AAF-9",
    });
  });

  it("does not rewrite a key mentioned inside a comment", () => {
    expect(withEnvValues("# A=example\nA=1\n", { A: "2" })).toBe("# A=example\nA=2\n");
  });

  it("leaves a line that is not a setting alone", () => {
    expect(withEnvValues("nonsense\nA=1\n", { A: "2" })).toBe("nonsense\nA=2\n");
  });

  it("adds a trailing newline to a file that had none", () => {
    expect(withEnvValues("A=1", { B: "2" })).toBe("A=1\nB=2\n");
  });

  it("writes a value containing the separator unbroken", () => {
    expect(withEnvValues("BOT_TOKEN=old\n", { BOT_TOKEN: "7968:AAF-9" })).toBe(
      "BOT_TOKEN=7968:AAF-9\n"
    );
  });

  it("appends several missing keys in the order they were given", () => {
    expect(withEnvValues("", { A: "1", B: "2" })).toBe("A=1\nB=2\n");
  });

  it("changes nothing when asked for no values at all", () => {
    expect(withEnvValues("A=1\n", {})).toBe("A=1\n");
  });
});
