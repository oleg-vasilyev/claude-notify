import { describe, expect, it } from "vitest";

import { relayWanted, secretChoice } from "#domain/setup-choice.ts";


const NOTHING_ASKED = {};
const FRESH_MACHINE = { sendsThroughARelay: false, secret: "" };
const ALREADY_RELAYED = { sendsThroughARelay: true, secret: "old" };
const SENDING = true;
const SENDING_DIRECT = false;
const HOSTING = true;
const NOT_HOSTING = false;

describe("relayWanted", () => {
  it("takes a relay url on the command line as the answer", () => {
    expect(relayWanted({ relayUrl: "http://home:8787" }, FRESH_MACHINE)).toBe(true);
  });

  it("keeps relaying on a machine already set up that way", () => {
    expect(relayWanted(NOTHING_ASKED, ALREADY_RELAYED)).toBe(true);
  });

  it("switches a relayed machine back to Telegram when a token is handed to it", () => {
    expect(relayWanted({ token: "T" }, ALREADY_RELAYED)).toBe(false);
  });

  it("prefers the relay url when both are given, since it is the more specific ask", () => {
    expect(relayWanted({ relayUrl: "http://home:8787", token: "T" }, FRESH_MACHINE)).toBe(true);
  });

  it("sends direct on a fresh machine that was asked for neither", () => {
    expect(relayWanted(NOTHING_ASKED, FRESH_MACHINE)).toBe(false);
  });

  it("sends direct on a machine already set up with a token", () => {
    expect(relayWanted(NOTHING_ASKED, { sendsThroughARelay: false, secret: "old" })).toBe(false);
  });
});

describe("secretChoice", () => {
  it("uses the secret typed on the command line", () => {
    expect(secretChoice({ secret: "given" }, ALREADY_RELAYED, SENDING, NOT_HOSTING)).toEqual({
      kind: "use",
      secret: "given",
    });
  });

  it("prefers what was typed over what the machine already had", () => {
    expect(secretChoice({ secret: "given" }, ALREADY_RELAYED, SENDING, HOSTING)).toEqual({
      kind: "use",
      secret: "given",
    });
  });

  it("keeps the secret the machine already had, so a rerun changes nothing", () => {
    expect(secretChoice(NOTHING_ASKED, ALREADY_RELAYED, SENDING, NOT_HOSTING)).toEqual({
      kind: "use",
      secret: "old",
    });
  });

  it("asks for the secret a relayed machine cannot invent for itself", () => {
    expect(secretChoice(NOTHING_ASKED, FRESH_MACHINE, SENDING, NOT_HOSTING)).toEqual({
      kind: "ask",
    });
  });

  it("generates one for a host, which is the only side allowed to choose it", () => {
    expect(secretChoice(NOTHING_ASKED, FRESH_MACHINE, SENDING_DIRECT, HOSTING)).toEqual({
      kind: "generate",
    });
  });

  it("asks rather than generating when the machine is a relay's client and its host", () => {
    expect(secretChoice(NOTHING_ASKED, FRESH_MACHINE, SENDING, HOSTING)).toEqual({ kind: "ask" });
  });

  it("wants no secret at all on a machine with nothing to do with any relay", () => {
    expect(secretChoice(NOTHING_ASKED, FRESH_MACHINE, SENDING_DIRECT, NOT_HOSTING)).toEqual({
      kind: "none",
    });
  });

  it("takes an empty secret on the command line at its word rather than inventing one", () => {
    expect(secretChoice({ secret: "" }, FRESH_MACHINE, SENDING_DIRECT, HOSTING)).toEqual({
      kind: "use",
      secret: "",
    });
  });
});
