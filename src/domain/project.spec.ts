import { describe, expect, it } from "vitest";

import {
  EVERY_PROJECT,
  projectKeyOf,
  projectPrefixOf,
  underProject,
  withMachineLabel,
} from "#domain/project.ts";


describe("underProject", () => {
  const WORKING_IN = "[a-project] ";

  it("names the project the caller is actually in", () => {
    expect(underProject("жду апрув", WORKING_IN)).toBe("[a-project] жду апрув");
  });

  it("replaces a prefix the model invented, since the folder is the truth", () => {
    expect(underProject("[another-project] жду апрув", WORKING_IN)).toBe("[a-project] жду апрув");
  });

  it("leaves the message alone when there is no working directory to name", () => {
    expect(underProject("[another-project] жду апрув", "")).toBe("[another-project] жду апрув");
  });

  it("does not mistake a bracket that never closes for a prefix", () => {
    expect(underProject("[не закрыл скобку", WORKING_IN)).toBe("[a-project] [не закрыл скобку");
  });

  it("keeps a labelled prefix out of the message body", () => {
    expect(underProject("[another-project@work] жду", WORKING_IN)).toBe("[a-project] жду");
  });

  it("survives a message that is nothing but a prefix", () => {
    expect(underProject("[another-project]", WORKING_IN)).toBe("[a-project] ");
  });

  it("leaves brackets inside the sentence alone — only a prefix is a prefix", () => {
    expect(underProject("жду решения по [миграции] сейчас", WORKING_IN)).toBe(
      "[a-project] жду решения по [миграции] сейчас"
    );
  });
});

describe("projectKeyOf", () => {
  it("reads the project from a plain prefix", () => {
    expect(projectKeyOf("[a-project] waiting")).toBe("a-project");
  });

  it("reads the project from a machine-labelled prefix", () => {
    expect(projectKeyOf("[another-project@home] waiting")).toBe("another-project");
  });

  it("falls back when there is no prefix", () => {
    expect(projectKeyOf("no prefix here")).toBe(EVERY_PROJECT);
  });

  it("falls back for an empty message", () => {
    expect(projectKeyOf("")).toBe(EVERY_PROJECT);
  });

  it("replaces what cannot live in a file name", () => {
    expect(projectKeyOf("[my proj!] hello")).toBe("my_proj_");
  });

  it("keeps a hyphen, which a project name usually has", () => {
    expect(projectKeyOf("[claude-notify] hello")).toBe("claude-notify");
  });
});

describe("withMachineLabel", () => {
  it("inserts the label into a plain prefix", () => {
    expect(withMachineLabel("[a-project] waiting", "home")).toBe("[a-project@home] waiting");
  });

  it("prefixes an unlabelled message with the machine alone", () => {
    expect(withMachineLabel("waiting for you", "work")).toBe("[work] waiting for you");
  });

  it("leaves an already labelled message alone, so a queued ping is not labelled twice", () => {
    expect(withMachineLabel("[proj@home] waiting", "home")).toBe("[proj@home] waiting");
  });

  it("leaves the message alone when no label is configured", () => {
    expect(withMachineLabel("[proj] waiting", "")).toBe("[proj] waiting");
  });

  it("keeps the rest of the message untouched", () => {
    expect(withMachineLabel("[a] b] c", "home")).toBe("[a@home] b] c");
  });
});

describe("projectPrefixOf", () => {
  it("names the project after the last segment of the path", () => {
    expect(projectPrefixOf("D:\\Temp\\another-project")).toBe("[another-project] ");
  });

  it("reads a posix path too", () => {
    expect(projectPrefixOf("/home/oleg/a-project")).toBe("[a-project] ");
  });

  it("ignores a trailing separator", () => {
    expect(projectPrefixOf("D:\\Temp\\another-project\\")).toBe("[another-project] ");
  });

  it("returns nothing when the payload carried no directory", () => {
    expect(projectPrefixOf(undefined)).toBe("");
  });

  it("returns nothing for an empty directory", () => {
    expect(projectPrefixOf("")).toBe("");
  });
});
