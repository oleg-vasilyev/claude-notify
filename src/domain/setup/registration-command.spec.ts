import { describe, expect, it } from "vitest";

import { forgetToolCommand, registerToolCommand } from "#domain/setup/registration-command.ts";


const NODE_WHERE_WINDOWS_PUTS_IT = "C:\\Program Files\\nodejs\\node.exe";
const ENTRY = "D:\\Temp\\a-project\\src\\mcp.ts";

describe("registerToolCommand", () => {
  it("quotes a runtime path with a space, or the CLI reads it as two arguments", () => {
    expect(registerToolCommand(NODE_WHERE_WINDOWS_PUTS_IT, ENTRY)).toContain(
      `-- "${NODE_WHERE_WINDOWS_PUTS_IT}" ${ENTRY}`
    );
  });

  it("quotes an entry point whose checkout has a space in its path", () => {
    const spaced = "D:\\My Projects\\a-project\\src\\mcp.ts";

    expect(registerToolCommand("node", spaced)).toContain(`-- node "${spaced}"`);
  });

  it("leaves a path with no space unquoted, since quotes are not decoration", () => {
    expect(registerToolCommand("node", ENTRY)).toBe(
      `claude mcp add --scope user claude-notify -- node ${ENTRY}`
    );
  });

  it("registers for every project on the machine, not just the one setup ran in", () => {
    expect(registerToolCommand("node", ENTRY)).toContain("--scope user");
  });
});

describe("forgetToolCommand", () => {
  it("names the same server the register command creates, so a rerun replaces it", () => {
    expect(forgetToolCommand()).toBe("claude mcp remove --scope user claude-notify");
  });
});
