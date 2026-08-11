import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parseEnvFile, withEnvValues } from "#domain/env-file.ts";
import { impossible } from "#domain/impossible.ts";
import { numberOr } from "#domain/written-number.ts";
import { envFile } from "#state/file-locations.ts";


const DEFAULT_MIN_IDLE_MINUTES = 3;
const DEFAULT_STALE_MINUTES = 15;
const DEFAULT_ASK_MINUTES = 10;
const DEFAULT_RELAY_PORT = 8787;

export const DELIVERY = {
  telegram: "telegram",
  relay: "relay",
} as const;

export type TelegramDelivery = {
  kind: typeof DELIVERY.telegram;
  token: string;
  chatId: string;
};

export type RelayDelivery = {
  kind: typeof DELIVERY.relay;
  url: string;
  secret: string;
};

export type Delivery = TelegramDelivery | RelayDelivery;

export type RelayHosting = { port: number; secret: string };

export type Config = {
  delivery: Delivery;
  machineLabel: string;
  minIdleMinutes: number;
  staleMinutes: number;
  includeUsage: boolean;
  askMinutes: number;
  quoteQuestions: boolean;
  hosting: RelayHosting | null;
};

const deliveryIn = (settings: Record<string, string>): Delivery | null => {
  if (settings.BOT_TOKEN && settings.CHAT_ID) {
    return { kind: DELIVERY.telegram, token: settings.BOT_TOKEN, chatId: settings.CHAT_ID };
  }

  if (settings.RELAY_URL && settings.RELAY_SECRET) {
    return { kind: DELIVERY.relay, url: settings.RELAY_URL, secret: settings.RELAY_SECRET };
  }

  return null;
};

const hostingIn = (settings: Record<string, string>, delivery: Delivery): RelayHosting | null =>
  delivery.kind === DELIVERY.telegram && settings.RELAY_SECRET
    ? { port: numberOr(settings.RELAY_PORT, DEFAULT_RELAY_PORT), secret: settings.RELAY_SECRET }
    : null;

const hostingKeys = (hosting: RelayHosting | null): Record<string, string> =>
  hosting === null
    ? { RELAY_SECRET: "", RELAY_PORT: "" }
    : { RELAY_SECRET: hosting.secret, RELAY_PORT: `${hosting.port}` };

const relayKeys = (delivery: Delivery, hosting: RelayHosting | null): Record<string, string> => {
  switch (delivery.kind) {
    case DELIVERY.telegram:
      return {
        BOT_TOKEN: delivery.token,
        CHAT_ID: delivery.chatId,
        RELAY_URL: "",
        ...hostingKeys(hosting),
      };

    case DELIVERY.relay:
      return {
        BOT_TOKEN: "",
        CHAT_ID: "",
        RELAY_URL: delivery.url,
        RELAY_SECRET: delivery.secret,
        RELAY_PORT: "",
      };

    default:
      return impossible(delivery);
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
    hosting: hostingIn(settings, delivery),
  };
};

export const readConfig = (): Config | null => readConfigFrom(envFile());

export const writeConfigTo = (path: string, config: Config): void => {
  const written = existsSync(path) ? readFileSync(path, "utf8") : "";

  writeFileSync(
    path,
    withEnvValues(written, {
      ...relayKeys(config.delivery, config.hosting),
      MACHINE_LABEL: config.machineLabel,
      MIN_IDLE_MINUTES: `${config.minIdleMinutes}`,
      STALE_MINUTES: `${config.staleMinutes}`,
      INCLUDE_USAGE: `${config.includeUsage}`,
      ASK_MINUTES: `${config.askMinutes}`,
      QUOTE_QUESTIONS: `${config.quoteQuestions}`,
    }),
    "utf8"
  );
};

export const writeConfig = (config: Config): void => writeConfigTo(envFile(), config);
