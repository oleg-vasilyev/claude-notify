import { describe, expect, it } from "vitest";

import { startupScript } from "#domain/startup-script.ts";


const NODE = "C:\\Program Files\\nodejs\\node.exe";
const ENTRY = "D:\\my code\\claude-notify\\src\\relay.ts";

describe("startupScript", () => {
  it("quotes a node path containing spaces", () => {
    expect(startupScript(NODE, ENTRY)).toContain(`"${NODE}"`);
  });

  it("quotes an entry path containing spaces", () => {
    expect(startupScript(NODE, ENTRY)).toContain(`"${ENTRY}"`);
  });

  it("names the window, so start does not read the node path as the title", () => {
    expect(startupScript(NODE, ENTRY)).toMatch(/start "[^"]+" \/min "/);
  });

  it("keeps the batch file from echoing its own command line at every login", () => {
    expect(startupScript(NODE, ENTRY).startsWith("@echo off")).toBe(true);
  });

  it("minimises the window rather than leaving it over the desktop at every login", () => {
    expect(startupScript(NODE, ENTRY)).toContain("/min");
  });

  it("ends its lines the way a batch file has to", () => {
    expect(startupScript(NODE, ENTRY).split("\r\n").length).toBeGreaterThan(1);
  });

  it("ends with a newline, since a batch file whose last line is bare may not run it", () => {
    expect(startupScript(NODE, ENTRY).endsWith("\r\n")).toBe(true);
  });
});
