import { describe, expect, it } from "vitest";

import {
  registerHooks,
  type ClaudeSettings,
  type HookCommand,
  type Registration,
} from "#domain/setup/hook-registration.ts";


const OURS = ["claude-notify", "telegram-notify"];

const ping: HookCommand = {
  type: "command",
  command: "node",
  args: ["D:\\somewhere\\t-claude\\src\\hook.ts", "Stop", "claude-notify"],
};

const chime: HookCommand = {
  type: "command",
  command: '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\chimes.wav").PlaySync()',
  shell: "powershell",
};

const registration: Registration = { event: "Stop", command: ping, sound: chime };

describe("registerHooks", () => {
  it("adds the hook to settings that had none", () => {
    const registered = registerHooks({}, [registration], OURS);

    expect(registered.hooks?.Stop).toHaveLength(1);
    expect(registered.hooks?.Stop?.[0]?.hooks).toContainEqual(ping);
  });

  it("keeps every unrelated setting untouched", () => {
    const settings: ClaudeSettings = { model: "opus", enabledPlugins: { a: true } };

    expect(registerHooks(settings, [registration], OURS).model).toBe("opus");
  });

  it("keeps hooks somebody else registered", () => {
    const settings: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "prettier --write ." }] }] },
    };

    const registered = registerHooks(settings, [registration], OURS);

    expect(registered.hooks?.Stop?.[0]?.hooks?.[0]?.command).toBe("prettier --write .");
    expect(registered.hooks?.Stop).toHaveLength(2);
  });

  it("replaces its own previous entry instead of stacking a second one", () => {
    const once = registerHooks({}, [registration], OURS);
    const twice = registerHooks(once, [registration], OURS);

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

    const once = registerHooks({}, [installedElsewhere], OURS);
    const moved = registerHooks(once, [registration], OURS);

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

    const registered = registerHooks(settings, [registration], OURS);

    expect(JSON.stringify(registered)).not.toContain("telegram-notify");
    expect(registered.hooks?.Stop).toHaveLength(1);
  });

  it("adds a sound when the event has none", () => {
    expect(registerHooks({}, [registration], OURS).hooks?.Stop?.[0]?.hooks).toContainEqual(chime);
  });

  it("leaves the sound alone when the user already has one", () => {
    const settings: ClaudeSettings = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: '(New-Object Media.SoundPlayer "beep.wav").PlaySync()' },
            ],
          },
        ],
      },
    };

    const registered = registerHooks(settings, [registration], OURS);

    expect(registered.hooks?.Stop?.[1]?.hooks).toEqual([ping]);
  });

  it("carries a matcher when the event needs one", () => {
    const scoped: Registration = {
      event: "PreToolUse",
      matcher: "AskUserQuestion|ExitPlanMode",
      command: ping,
    };

    expect(registerHooks({}, [scoped], OURS).hooks?.PreToolUse?.[0]?.matcher).toBe(
      "AskUserQuestion|ExitPlanMode"
    );
  });

  it("leaves out the matcher key entirely when there is none", () => {
    expect(registerHooks({}, [registration], OURS).hooks?.Stop?.[0]).not.toHaveProperty("matcher");
  });

  it("registers several events in one pass", () => {
    const registered = registerHooks(
      {},
      [registration, { event: "Notification", command: ping }],
      OURS
    );

    expect(Object.keys(registered.hooks ?? {})).toEqual(["Stop", "Notification"]);
  });

  it("does not mutate the settings it was given", () => {
    const settings: ClaudeSettings = { hooks: { Stop: [] } };

    registerHooks(settings, [registration], OURS);

    expect(settings.hooks?.Stop).toEqual([]);
  });
});
