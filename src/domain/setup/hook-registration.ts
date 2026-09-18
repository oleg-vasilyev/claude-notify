import type { HookEvent } from "#domain/hook-event.ts";


const NOTHING_LEFT = 0;

export type HookCommand = {
  type: "command";
  command: string;
  args?: string[];
  shell?: string;
  timeout?: number;
  async?: boolean;
};

export type HookGroup = {
  matcher?: string;
  hooks: HookCommand[];
};

export type ClaudeSettings = {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
};

export type Registration = {
  event: HookEvent;
  matcher?: string;
  command: HookCommand;
};

const isOurs = (group: HookGroup, ownedMarkers: readonly string[]): boolean => {
  const written = JSON.stringify(group);

  return ownedMarkers.some((marker) => written.includes(marker));
};

const withoutRetired = (group: HookGroup, retiredCommands: readonly string[]): HookGroup => ({
  ...group,
  hooks: group.hooks.filter((hook) => !retiredCommands.includes(hook.command)),
});

const stillRuns = (group: HookGroup): boolean => group.hooks.length > NOTHING_LEFT;

export const registerHooks = (
  settings: ClaudeSettings,
  registrations: readonly Registration[],
  ownedMarkers: readonly string[],
  retiredCommands: readonly string[]
): ClaudeSettings => {
  const hooks: Record<string, HookGroup[]> = { ...(settings.hooks ?? {}) };

  for (const registration of registrations) {
    const kept = (hooks[registration.event] ?? [])
      .filter((group) => !isOurs(group, ownedMarkers))
      .map((group) => withoutRetired(group, retiredCommands))
      .filter(stillRuns);

    const group: HookGroup =
      registration.matcher === undefined
        ? { hooks: [registration.command] }
        : { matcher: registration.matcher, hooks: [registration.command] };

    hooks[registration.event] = [...kept, group];
  }

  return { ...settings, hooks };
};
