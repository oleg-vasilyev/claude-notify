import { describe, expect, it } from "vitest";

import { MEMORY_RULE_HEADING, memoryRule, withMemoryRule } from "#domain/setup/memory-rule.ts";


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
