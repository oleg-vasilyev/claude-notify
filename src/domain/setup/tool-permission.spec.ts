import { describe, expect, it } from "vitest";

import {
  PING_TOOL_PERMISSION,
  withToolAllowed,
  type PermittedSettings,
} from "#domain/setup/tool-permission.ts";


describe("PING_TOOL_PERMISSION", () => {
  it("names the tool exactly, which is what a shell command could never be", () => {
    expect(PING_TOOL_PERMISSION).toBe("mcp__claude-notify__ping_user");
  });
});

describe("withToolAllowed", () => {
  it("allows the tool on a machine that had no permissions at all", () => {
    expect(withToolAllowed({}, PING_TOOL_PERMISSION)).toEqual({
      permissions: { allow: [PING_TOOL_PERMISSION] },
    });
  });

  it("keeps every permission the user already granted", () => {
    const settings: PermittedSettings = { permissions: { allow: ["Bash(npm run test)"] } };

    expect(withToolAllowed(settings, PING_TOOL_PERMISSION).permissions?.allow).toEqual([
      "Bash(npm run test)",
      PING_TOOL_PERMISSION,
    ]);
  });

  it("does not grant the same tool twice when setup runs again", () => {
    const settings: PermittedSettings = { permissions: { allow: [PING_TOOL_PERMISSION] } };

    expect(withToolAllowed(settings, PING_TOOL_PERMISSION)).toBe(settings);
  });

  it("leaves the rest of the permissions block alone", () => {
    const settings: PermittedSettings = {
      permissions: { deny: ["Bash(rm -rf /)"], defaultMode: "acceptEdits" },
    };

    expect(withToolAllowed(settings, PING_TOOL_PERMISSION).permissions).toEqual({
      deny: ["Bash(rm -rf /)"],
      defaultMode: "acceptEdits",
      allow: [PING_TOOL_PERMISSION],
    });
  });

  it("leaves everything outside permissions untouched", () => {
    const settings: PermittedSettings = { hooks: { Stop: [] } };

    expect(withToolAllowed(settings, PING_TOOL_PERMISSION).hooks).toEqual({ Stop: [] });
  });
});
