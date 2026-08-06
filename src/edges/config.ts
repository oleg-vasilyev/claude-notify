import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { configFile, stateHome } from "#edges/paths.ts";


const DEFAULT_MIN_IDLE_MINUTES = 3;
const DEFAULT_STALE_MINUTES = 15;
const JSON_INDENT = 2;

export type Config = {
  token: string;
  chatId: string;
  machineLabel: string;
  minIdleMinutes: number;
  staleMinutes: number;
  includeUsage: boolean;
};

type StoredConfig = {
  token?: string;
  chat_id?: string;
  machine_label?: string;
  min_idle_minutes?: number;
  stale_minutes?: number;
  include_usage?: boolean;
};

export const readConfigFrom = (path: string): Config | null => {
  let stored: StoredConfig;

  try {
    stored = JSON.parse(readFileSync(path, "utf8")) as StoredConfig;
  } catch {
    return null;
  }

  if (stored.token === undefined || stored.chat_id === undefined) {
    return null;
  }

  return {
    token: stored.token,
    chatId: stored.chat_id,
    machineLabel: stored.machine_label ?? "",
    minIdleMinutes: stored.min_idle_minutes ?? DEFAULT_MIN_IDLE_MINUTES,
    staleMinutes: stored.stale_minutes ?? DEFAULT_STALE_MINUTES,
    includeUsage: stored.include_usage ?? true,
  };
};

export const readConfig = (): Config | null => readConfigFrom(configFile());

export const writeConfig = (config: Config): void => {
  const stored: StoredConfig = {
    token: config.token,
    chat_id: config.chatId,
    machine_label: config.machineLabel,
    min_idle_minutes: config.minIdleMinutes,
    stale_minutes: config.staleMinutes,
    include_usage: config.includeUsage,
  };

  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(configFile(), `${JSON.stringify(stored, null, JSON_INDENT)}\n`, "utf8");
};
