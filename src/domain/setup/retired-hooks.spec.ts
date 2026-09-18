import { describe, expect, it } from "vitest";

import {
  registerHooks,
  type ClaudeSettings,
  type HookCommand,
} from "#domain/setup/hook-registration.ts";
import { RETIRED_HOOK_COMMANDS } from "#domain/setup/retired-hooks.ts";


const OURS = ["claude-notify", "telegram-notify"];

const ping: HookCommand = {
  type: "command",
  command: "node",
  args: ["D:\\somewhere\\t-claude\\src\\hook.ts", "Stop", "claude-notify"],
};

const registration = { event: "Stop", command: ping } as const;

const asSetupWroteIt = (wav: string): HookCommand => ({
  type: "command",
  command: `(New-Object Media.SoundPlayer "${wav}").PlaySync()`,
  shell: "powershell",
  timeout: 15,
  async: true,
});

const turnEnded = asSetupWroteIt("C:\\Windows\\Media\\Windows Notify.wav");
const waitingOnYou = asSetupWroteIt("C:\\Windows\\Media\\chimes.wav");

describe("RETIRED_HOOK_COMMANDS", () => {
  it("takes back the sound the installer planted in its own group, the shape found in the wild", () => {
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [turnEnded] }] } };

    const registered = registerHooks(settings, [registration], OURS, RETIRED_HOOK_COMMANDS);

    expect(registered.hooks?.Stop).toEqual([{ hooks: [ping] }]);
  });

  it("takes back the other one, whichever event it was left under", () => {
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [waitingOnYou] }] } };

    const registered = registerHooks(settings, [registration], OURS, RETIRED_HOOK_COMMANDS);

    expect(JSON.stringify(registered)).not.toContain("SoundPlayer");
  });

  it("takes back the one that sits beside our own command, the shape the installer wrote", () => {
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [turnEnded, ping] }] } };

    const registered = registerHooks(settings, [registration], OURS, RETIRED_HOOK_COMMANDS);

    expect(registered.hooks?.Stop).toEqual([{ hooks: [ping] }]);
  });

  it("is a frozen record of what was written, never derived from the sounds played today", () => {
    expect(RETIRED_HOOK_COMMANDS).toEqual([
      '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\Windows Notify.wav").PlaySync()',
      '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\chimes.wav").PlaySync()',
    ]);
  });
});
