import type { HookEvent } from "#domain/hook-event.ts";


const PLAYS_A_SOUND = /SoundPlayer|PlaySync|afplay|\.wav/i;

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
  sound?: HookCommand;
};

const isOurs = (group: HookGroup, ownedMarkers: readonly string[]): boolean => {
  const written = JSON.stringify(group);

  return ownedMarkers.some((marker) => written.includes(marker));
};

const alreadyMakesNoise = (groups: readonly HookGroup[]): boolean =>
  groups.some((group) => group.hooks.some((hook) => PLAYS_A_SOUND.test(hook.command)));

export const registerHooks = (
  settings: ClaudeSettings,
  registrations: readonly Registration[],
  ownedMarkers: readonly string[]
): ClaudeSettings => {
  const hooks: Record<string, HookGroup[]> = { ...(settings.hooks ?? {}) };

  for (const registration of registrations) {
    const kept = (hooks[registration.event] ?? []).filter((group) => !isOurs(group, ownedMarkers));
    const added: HookCommand[] = [];

    if (registration.sound !== undefined && !alreadyMakesNoise(kept)) {
      added.push(registration.sound);
    }

    added.push(registration.command);

    const group: HookGroup =
      registration.matcher === undefined
        ? { hooks: added }
        : { matcher: registration.matcher, hooks: added };

    hooks[registration.event] = [...kept, group];
  }

  return { ...settings, hooks };
};
