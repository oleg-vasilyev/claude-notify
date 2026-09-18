import { describe, expect, it } from "vitest";

import {
  registerHooks,
  type ClaudeSettings,
  type HookCommand,
  type Registration,
} from "#domain/setup/hook-registration.ts";


const OURS = ["claude-notify", "telegram-notify"];
const NOTHING_RETIRED: string[] = [];

const ping: HookCommand = {
  type: "command",
  command: "node",
  args: ["D:\\somewhere\\t-claude\\src\\hook.ts", "Stop", "claude-notify"],
};

const CHIME = '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\chimes.wav").PlaySync()';
const RETIRED = [CHIME];

const chime: HookCommand = { type: "command", command: CHIME, shell: "powershell" };

const registration: Registration = { event: "Stop", command: ping };

describe("registerHooks", () => {
  it("adds the hook to settings that had none", () => {
    const registered = registerHooks({}, [registration], OURS, NOTHING_RETIRED);

    expect(registered.hooks?.Stop).toHaveLength(1);
    expect(registered.hooks?.Stop?.[0]?.hooks).toEqual([ping]);
  });

  it("keeps every unrelated setting untouched", () => {
    const settings: ClaudeSettings = { model: "opus", enabledPlugins: { a: true } };

    expect(registerHooks(settings, [registration], OURS, NOTHING_RETIRED).model).toBe("opus");
  });

  it("keeps hooks somebody else registered", () => {
    const settings: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "prettier --write ." }] }] },
    };

    const registered = registerHooks(settings, [registration], OURS, NOTHING_RETIRED);

    expect(registered.hooks?.Stop?.[0]?.hooks?.[0]?.command).toBe("prettier --write .");
    expect(registered.hooks?.Stop).toHaveLength(2);
  });

  it("replaces its own previous entry instead of stacking a second one", () => {
    const once = registerHooks({}, [registration], OURS, NOTHING_RETIRED);
    const twice = registerHooks(once, [registration], OURS, NOTHING_RETIRED);

    expect(twice.hooks?.Stop).toHaveLength(1);
  });

  it("recognises its own entry after the checkout has moved, since the marker is not a path", () => {
    const installedElsewhere: Registration = {
      event: "Stop",
      command: {
        type: "command",
        command: "node",
        args: ["C:\\Users\\me\\projects\\notifier\\src\\hook.ts", "Stop", "claude-notify"],
      },
    };

    const once = registerHooks({}, [installedElsewhere], OURS, NOTHING_RETIRED);
    const moved = registerHooks(once, [registration], OURS, NOTHING_RETIRED);

    expect(moved.hooks?.Stop).toHaveLength(1);
    expect(JSON.stringify(moved)).not.toContain("projects");
  });

  it("replaces the entry left by the PowerShell version it succeeds", () => {
    const settings: ClaudeSettings = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "powershell",
                args: ["-File", "C:\\Users\\me\\.claude\\scripts\\telegram-notify\\hook-stop.ps1"],
              },
            ],
          },
        ],
      },
    };

    const registered = registerHooks(settings, [registration], OURS, NOTHING_RETIRED);

    expect(JSON.stringify(registered)).not.toContain("telegram-notify");
    expect(registered.hooks?.Stop).toHaveLength(1);
  });

  it("registers no sound of its own, since the hook decides whether one is deserved", () => {
    const registered = registerHooks({}, [registration], OURS, RETIRED);

    expect(JSON.stringify(registered)).not.toContain("SoundPlayer");
  });

  it("takes back the sound it planted in an earlier version, group and all", () => {
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [chime] }] } };

    const registered = registerHooks(settings, [registration], OURS, RETIRED);

    expect(registered.hooks?.Stop).toEqual([{ hooks: [ping] }]);
  });

  it("takes it back without disturbing what sits beside it", () => {
    const alongside: HookCommand = { type: "command", command: "prettier --write ." };
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [chime, alongside] }] } };

    const registered = registerHooks(settings, [registration], OURS, RETIRED);

    expect(registered.hooks?.Stop?.[0]?.hooks).toEqual([alongside]);
  });

  it("leaves a sound the user chose themselves, since only our own is retired", () => {
    const theirs: HookCommand = {
      type: "command",
      command: '(New-Object Media.SoundPlayer "beep.wav").PlaySync()',
    };
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [theirs] }] } };

    const registered = registerHooks(settings, [registration], OURS, RETIRED);

    expect(registered.hooks?.Stop?.[0]?.hooks).toEqual([theirs]);
    expect(registered.hooks?.Stop).toHaveLength(2);
  });

  it("carries a matcher when the event needs one", () => {
    const scoped: Registration = {
      event: "PreToolUse",
      matcher: "AskUserQuestion|ExitPlanMode",
      command: ping,
    };

    expect(registerHooks({}, [scoped], OURS, NOTHING_RETIRED).hooks?.PreToolUse?.[0]).toEqual({
      matcher: "AskUserQuestion|ExitPlanMode",
      hooks: [ping],
    });
  });

  it("leaves out the matcher key entirely when there is none", () => {
    expect(
      registerHooks({}, [registration], OURS, NOTHING_RETIRED).hooks?.Stop?.[0]
    ).not.toHaveProperty("matcher");
  });

  it("registers several events in one pass", () => {
    const registered = registerHooks(
      {},
      [registration, { event: "Notification", command: ping }],
      OURS,
      NOTHING_RETIRED
    );

    expect(Object.keys(registered.hooks ?? {})).toEqual(["Stop", "Notification"]);
  });

  it("does not mutate the settings it was given", () => {
    const settings: ClaudeSettings = { hooks: { Stop: [{ hooks: [chime] }] } };

    registerHooks(settings, [registration], OURS, RETIRED);

    expect(settings.hooks?.Stop).toEqual([{ hooks: [chime] }]);
  });
});
