import { describe, expect, it } from "vitest";

import { escaped, messageWith } from "#domain/telegram-html.ts";


const BLOCK = "5-hour  ━━────────   24%";

describe("escaped", () => {
  it("leaves ordinary text alone, including the Russian a ping is written in", () => {
    expect(escaped("[a-project@home] жду апрув")).toBe("[a-project@home] жду апрув");
  });

  it("escapes the three characters HTML mode reads as markup", () => {
    expect(escaped("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("escapes the ampersand first, so an escape is never escaped twice", () => {
    expect(escaped("&lt;")).toBe("&amp;lt;");
  });

  it("survives a model writing something that looks like a tag", () => {
    expect(escaped("<b>жду</b>")).toBe("&lt;b&gt;жду&lt;/b&gt;");
  });
});

describe("messageWith", () => {
  it("sends the text alone when there are no limits to show", () => {
    expect(messageWith("[a] жду апрув", "")).toBe("[a] жду апрув");
  });

  it("puts the limits in a preformatted block, which is what keeps the columns straight", () => {
    expect(messageWith("[a] жду апрув", BLOCK)).toBe(`[a] жду апрув\n\n<pre>${BLOCK}</pre>`);
  });

  it("escapes the block too, since a model name is not ours to trust", () => {
    expect(messageWith("[a] жду", "weekly<b>  50%")).toContain("weekly&lt;b&gt;  50%");
  });

  it("escapes the text even when a block rides along", () => {
    expect(messageWith("a & b", BLOCK).startsWith("a &amp; b")).toBe(true);
  });
});
