import { describe, expect, it } from "vitest";

import {
  memoryAfterSetup,
  MEMORY_RULE_HEADING,
  memoryRule,
  withMemoryRule,
  withoutMemoryRule,
} from "#domain/setup/memory-rule.ts";


const REGISTERED = true;
const NOT_REGISTERED = false;


const COMMAND = "node D:\\repo\\claude-notify\\src\\notify.ts";

describe("memoryRule", () => {
  it("tells the model the command it has to run", () => {
    expect(memoryRule(COMMAND)).toContain(`${COMMAND} --message`);
  });
});

describe("withMemoryRule", () => {
  it("adds the rule to an empty memory file", () => {
    expect(withMemoryRule("", COMMAND)).toContain(MEMORY_RULE_HEADING);
  });

  it("keeps what the user already wrote", () => {
    const existing = "# My own rules\n\nAlways answer in Russian.";

    expect(withMemoryRule(existing, COMMAND)).toContain("Always answer in Russian.");
  });

  it("separates the rule from what came before", () => {
    expect(withMemoryRule("# Mine", COMMAND)).toContain(`# Mine\n\n${MEMORY_RULE_HEADING}`);
  });

  it("does not add the rule twice", () => {
    const once = withMemoryRule("", COMMAND);

    expect(withMemoryRule(once, COMMAND)).toBe(once);
  });

  it("replaces a rule left by an older version, so the command never goes stale", () => {
    const stale = `${MEMORY_RULE_HEADING}\n\nrun powershell notify.ps1 instead\n`;
    const refreshed = withMemoryRule(stale, COMMAND);

    expect(refreshed).toContain(COMMAND);
    expect(refreshed).not.toContain("notify.ps1");
  });

  it("keeps the user's own sections when it replaces a stale rule", () => {
    const stale = `# Mine\n\nkeep me\n\n${MEMORY_RULE_HEADING}\n\nstale\n\n# Also mine\n\nkeep me too\n`;
    const refreshed = withMemoryRule(stale, COMMAND);

    expect(refreshed).toContain("keep me");
    expect(refreshed).toContain("# Also mine");
    expect(refreshed).toContain("keep me too");
    expect(refreshed).not.toContain("stale");
  });
});

describe("withoutMemoryRule", () => {
  it("takes the rule out once the tool describes itself", () => {
    expect(withoutMemoryRule(withMemoryRule("", COMMAND))).toBe("");
  });

  it("leaves a memory file that never had the rule exactly as it was", () => {
    const mine = "# My own rules\n\nAlways answer in Russian.\n";

    expect(withoutMemoryRule(mine)).toBe(mine);
  });

  it("keeps the sections on both sides of the rule it removes, exactly", () => {
    const both = `# Mine\n\nkeep me\n\n${MEMORY_RULE_HEADING}\n\ngoing away\n\n# Also mine\n\nkeep me too\n`;

    expect(withoutMemoryRule(both)).toBe("# Mine\n\nkeep me\n\n# Also mine\n\nkeep me too\n");
  });

  it("does not leave a blank file full of newlines behind", () => {
    expect(withoutMemoryRule(`\n\n${MEMORY_RULE_HEADING}\n\nonly this\n\n`)).toBe("");
  });

  it("does not leave the blank lines behind when the rule came first", () => {
    const first = `${MEMORY_RULE_HEADING}\n\ngoing away\n\n# Mine\n\nkeep me\n`;

    expect(withoutMemoryRule(first)).toBe("# Mine\n\nkeep me\n");
  });

  it("is safe to run again when the rule is already gone", () => {
    const once = withoutMemoryRule(`# Mine\n\nkeep me\n\n${MEMORY_RULE_HEADING}\n\ngone\n`);

    expect(withoutMemoryRule(once)).toBe(once);
  });
});

describe("memoryAfterSetup", () => {
  it("retires the rule once the tool carries its own description", () => {
    const installed = withMemoryRule("", COMMAND);

    expect(memoryAfterSetup(installed, COMMAND, REGISTERED)).toBe("");
  });

  it("keeps the rule when the tool could not be registered, so a machine is never left with neither", () => {
    expect(memoryAfterSetup("", COMMAND, NOT_REGISTERED)).toContain(MEMORY_RULE_HEADING);
  });

  it("puts the rule back on a machine the tool never reached", () => {
    const stripped = withoutMemoryRule(withMemoryRule("# Mine\n\nkeep me\n", COMMAND));
    const restored = memoryAfterSetup(stripped, COMMAND, NOT_REGISTERED);

    expect(restored).toContain(MEMORY_RULE_HEADING);
    expect(restored).toContain("keep me");
  });
});
