import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parseEnvFile, withEnvValues } from "#domain/env-file.ts";
import { envFile } from "#state/file-locations.ts";


const DEFAULT_MIN_IDLE_MINUTES = 3;
const DEFAULT_STALE_MINUTES = 15;
const DEFAULT_ASK_MINUTES = 10;
const DEFAULT_RELAY_PORT = 8787;
const DECIMAL = 10;

export type TelegramDelivery = { kind: "telegram"; token: string; chatId: string };

export type RelayDelivery = { kind: "relay"; url: string };

export type Delivery = TelegramDelivery | RelayDelivery;

export type Config = {
  delivery: Delivery;
  machineLabel: string;
  minIdleMinutes: number;
  staleMinutes: number;
  includeUsage: boolean;
  askMinutes: number;
  quoteQuestions: boolean;
  relaySecret: string;
  relayPort: number;
};

const numberOr = (written: string | undefined, fallback: number): number => {
  const value = Number.parseInt(written ?? "", DECIMAL);

  return Number.isNaN(value) ? fallback : value;
};

const deliveryIn = (settings: Record<string, string>): Delivery | null => {
  if (settings.BOT_TOKEN && settings.CHAT_ID) {
    return { kind: "telegram", token: settings.BOT_TOKEN, chatId: settings.CHAT_ID };
  }

  if (settings.RELAY_URL) {
    return { kind: "relay", url: settings.RELAY_URL };
  }

  return null;
};

const deliveryKeys = (delivery: Delivery): Record<string, string> => {
  switch (delivery.kind) {
    case "telegram":
      return { BOT_TOKEN: delivery.token, CHAT_ID: delivery.chatId, RELAY_URL: "" };

    case "relay":
      return { BOT_TOKEN: "", CHAT_ID: "", RELAY_URL: delivery.url };
  }
};

export const readConfigFrom = (path: string): Config | null => {
  if (!existsSync(path)) {
    return null;
  }

  const settings = parseEnvFile(readFileSync(path, "utf8"));
  const delivery = deliveryIn(settings);

  if (delivery === null) {
    return null;
  }

  return {
    delivery,
    machineLabel: settings.MACHINE_LABEL ?? "",
    minIdleMinutes: numberOr(settings.MIN_IDLE_MINUTES, DEFAULT_MIN_IDLE_MINUTES),
    staleMinutes: numberOr(settings.STALE_MINUTES, DEFAULT_STALE_MINUTES),
    includeUsage: settings.INCLUDE_USAGE !== "false",
    askMinutes: numberOr(settings.ASK_MINUTES, DEFAULT_ASK_MINUTES),
    quoteQuestions: settings.QUOTE_QUESTIONS !== "false",
    relaySecret: settings.RELAY_SECRET ?? "",
    relayPort: numberOr(settings.RELAY_PORT, DEFAULT_RELAY_PORT),
  };
};

export const readConfig = (): Config | null => readConfigFrom(envFile());

export const writeConfigTo = (path: string, config: Config): void => {
  const written = existsSync(path) ? readFileSync(path, "utf8") : "";

  writeFileSync(
    path,
    withEnvValues(written, {
      ...deliveryKeys(config.delivery),
      MACHINE_LABEL: config.machineLabel,
      MIN_IDLE_MINUTES: `${config.minIdleMinutes}`,
      STALE_MINUTES: `${config.staleMinutes}`,
      INCLUDE_USAGE: `${config.includeUsage}`,
      ASK_MINUTES: `${config.askMinutes}`,
      QUOTE_QUESTIONS: `${config.quoteQuestions}`,
      RELAY_SECRET: config.relaySecret,
      RELAY_PORT: `${config.relayPort}`,
    }),
    "utf8"
  );
};

export const writeConfig = (config: Config): void => writeConfigTo(envFile(), config);
