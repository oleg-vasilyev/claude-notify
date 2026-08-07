import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parseEnvFile, withEnvValues } from "#domain/env-file.ts";
import { envFile } from "#state/file-locations.ts";


const DEFAULT_MIN_IDLE_MINUTES = 3;
const DEFAULT_STALE_MINUTES = 15;
const DEFAULT_ASK_MINUTES = 10;
const DECIMAL = 10;

export type Config = {
  token: string;
  chatId: string;
  machineLabel: string;
  minIdleMinutes: number;
  staleMinutes: number;
  includeUsage: boolean;
  askMinutes: number;
};

const numberOr = (written: string | undefined, fallback: number): number => {
  const value = Number.parseInt(written ?? "", DECIMAL);

  return Number.isNaN(value) ? fallback : value;
};

export const readConfigFrom = (path: string): Config | null => {
  if (!existsSync(path)) {
    return null;
  }

  const settings = parseEnvFile(readFileSync(path, "utf8"));

  if (!settings.BOT_TOKEN || !settings.CHAT_ID) {
    return null;
  }

  return {
    token: settings.BOT_TOKEN,
    chatId: settings.CHAT_ID,
    machineLabel: settings.MACHINE_LABEL ?? "",
    minIdleMinutes: numberOr(settings.MIN_IDLE_MINUTES, DEFAULT_MIN_IDLE_MINUTES),
    staleMinutes: numberOr(settings.STALE_MINUTES, DEFAULT_STALE_MINUTES),
    includeUsage: settings.INCLUDE_USAGE !== "false",
    askMinutes: numberOr(settings.ASK_MINUTES, DEFAULT_ASK_MINUTES),
  };
};

export const readConfig = (): Config | null => readConfigFrom(envFile());

export const writeConfigTo = (path: string, config: Config): void => {
  const written = existsSync(path) ? readFileSync(path, "utf8") : "";

  writeFileSync(
    path,
    withEnvValues(written, {
      BOT_TOKEN: config.token,
      CHAT_ID: config.chatId,
      MACHINE_LABEL: config.machineLabel,
      MIN_IDLE_MINUTES: `${config.minIdleMinutes}`,
      STALE_MINUTES: `${config.staleMinutes}`,
      INCLUDE_USAGE: `${config.includeUsage}`,
      ASK_MINUTES: `${config.askMinutes}`,
    }),
    "utf8"
  );
};

export const writeConfig = (config: Config): void => writeConfigTo(envFile(), config);
