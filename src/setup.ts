import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { ClaudeSettings, HookCommand, Registration } from "#domain/hook-registration.ts";
import { registerHooks } from "#domain/hook-registration.ts";
import { withMemoryRule } from "#domain/memory-rule.ts";
import { relayWanted, secretChoice, type Inherited } from "#domain/setup-choice.ts";
import { startupScript } from "#domain/startup-script.ts";
import { relayAnswers, relayMessage } from "#relay/relay-client.ts";
import { readConfigFrom, writeConfig, type Config, type Delivery } from "#state/config.ts";
import {
  claudeHome,
  claudeMemoryFile,
  claudeSettingsFile,
  envFile,
  legacyConfigFile,
  powershellConfigFile,
  startupRelayFile,
} from "#state/file-locations.ts";
import { botName, resolveChatId, sendMessage } from "#telegram/telegram-api.ts";


const HOOK_TIMEOUT_SECONDS = 30;
const ASK_HOOK_TIMEOUT_SECONDS = 900;
const SOUND_TIMEOUT_SECONDS = 15;
const DEFAULT_MIN_IDLE_MINUTES = 3;
const DEFAULT_STALE_MINUTES = 15;
const DEFAULT_ASK_MINUTES = 10;
const DEFAULT_RELAY_PORT = 8787;
const SECRET_BYTES = 24;
const DECIMAL = 10;
const OWNED_MARKER = "claude-notify";
const OWNED_MARKERS = [OWNED_MARKER, "telegram-notify"];
const JSON_INDENT = 2;

const { values } = parseArgs({
  options: {
    token: { type: "string" },
    label: { type: "string" },
    "relay-url": { type: "string" },
    "relay-secret": { type: "string" },
    "relay-port": { type: "string" },
    "skip-test": { type: "boolean", default: false },
  },
});

const hookEntry = fileURLToPath(new URL("./hook.ts", import.meta.url));
const notifyEntry = fileURLToPath(new URL("./notify.ts", import.meta.url));
const relayEntry = fileURLToPath(new URL("./relay.ts", import.meta.url));

const pingCommand = (event: string): HookCommand => ({
  type: "command",
  command: process.execPath,
  args: [hookEntry, event, OWNED_MARKER],
  timeout: HOOK_TIMEOUT_SECONDS,
  async: true,
});

const askCommand = (event: string): HookCommand => ({
  type: "command",
  command: process.execPath,
  args: [hookEntry, event, OWNED_MARKER],
  timeout: ASK_HOOK_TIMEOUT_SECONDS,
});

const soundOf = (wav: string): HookCommand => ({
  type: "command",
  command: `(New-Object Media.SoundPlayer "${wav}").PlaySync()`,
  shell: "powershell",
  timeout: SOUND_TIMEOUT_SECONDS,
  async: true,
});

const REGISTRATIONS: Registration[] = [
  {
    event: "Stop",
    command: pingCommand("Stop"),
    sound: soundOf("C:\\Windows\\Media\\Windows Notify.wav"),
  },
  {
    event: "Notification",
    command: pingCommand("Notification"),
    sound: soundOf("C:\\Windows\\Media\\chimes.wav"),
  },
  {
    event: "PreToolUse",
    matcher: "AskUserQuestion|ExitPlanMode",
    command: askCommand("PreToolUse"),
  },
  { event: "PermissionRequest", command: askCommand("PermissionRequest") },
];

const ask = async (question: string): Promise<string> => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return (await terminal.question(question)).trim();
  } finally {
    terminal.close();
  }
};

const numberOr = (written: string | undefined, fallback: number): number => {
  const value = Number.parseInt(written ?? "", DECIMAL);

  return Number.isNaN(value) ? fallback : value;
};

const readJsonFile = <T>(path: string, fallback: T): T => {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
};

const legacyJsonConfig = (path: string): Config | null => {
  const stored = readJsonFile<Record<string, string | number | boolean>>(path, {});

  if (typeof stored.token !== "string" || typeof stored.chat_id !== "string") {
    return null;
  }

  return {
    delivery: { kind: "telegram", token: stored.token, chatId: stored.chat_id },
    machineLabel: typeof stored.machine_label === "string" ? stored.machine_label : "",
    minIdleMinutes:
      typeof stored.min_idle_minutes === "number"
        ? stored.min_idle_minutes
        : DEFAULT_MIN_IDLE_MINUTES,
    staleMinutes:
      typeof stored.stale_minutes === "number" ? stored.stale_minutes : DEFAULT_STALE_MINUTES,
    includeUsage: stored.include_usage !== false,
    askMinutes: DEFAULT_ASK_MINUTES,
    quoteQuestions: true,
    relaySecret: "",
    relayPort: DEFAULT_RELAY_PORT,
  };
};

const inherited =
  readConfigFrom(envFile()) ??
  legacyJsonConfig(legacyConfigFile()) ??
  legacyJsonConfig(powershellConfigFile());

const inheritedToken =
  inherited?.delivery.kind === "telegram" ? inherited.delivery.token : undefined;
const inheritedChatId =
  inherited?.delivery.kind === "telegram" ? inherited.delivery.chatId : undefined;
const inheritedRelayUrl = inherited?.delivery.kind === "relay" ? inherited.delivery.url : undefined;

const telegramDelivery = async (): Promise<Delivery> => {
  const token = values.token ?? inheritedToken ?? (await ask("Telegram bot token: "));

  if (token === "") {
    throw new Error("a bot token is required — create one with @BotFather");
  }

  const bot = await botName(token);

  console.log(`bot ok: @${bot}`);

  const chatId =
    inheritedChatId !== undefined && inheritedToken === token
      ? inheritedChatId
      : ((await resolveChatId(token)) ??
        (() => {
          throw new Error(`no messages yet — write /start to @${bot} first, then run setup again`);
        })());

  console.log(`chat id: ${chatId}`);

  return { kind: "telegram", token, chatId };
};

const relayDelivery = async (): Promise<Delivery> => {
  const url =
    values["relay-url"] ??
    inheritedRelayUrl ??
    (await ask("Relay URL (http://home-laptop:8787): "));

  if (url === "") {
    throw new Error("a relay needs the URL of the machine that can reach Telegram");
  }

  if (!(await relayAnswers(url))) {
    throw new Error(
      `nothing answered at ${url} — start the relay there with "npm run relay", and let its port through that machine's firewall`
    );
  }

  console.log(`relay ok: ${url}`);

  return { kind: "relay", url };
};

const asked = {
  relayUrl: values["relay-url"],
  token: values.token,
  secret: values["relay-secret"],
};

const carriedOver: Inherited = {
  sendsThroughARelay: inheritedRelayUrl !== undefined,
  secret: inherited?.relaySecret ?? "",
};

const delivery = relayWanted(asked, carriedOver) ? await relayDelivery() : await telegramDelivery();

const machineLabel =
  values.label ?? inherited?.machineLabel ?? (await ask("Machine label (home / work): "));

const hosting = values["relay-port"] !== undefined;
const relayPort = numberOr(values["relay-port"], inherited?.relayPort ?? DEFAULT_RELAY_PORT);

const chosenSecret = async (): Promise<string> => {
  const choice = secretChoice(asked, carriedOver, delivery.kind === "relay", hosting);

  switch (choice.kind) {
    case "use":
      return choice.secret;

    case "ask":
      return ask("Relay secret (the one its host printed): ");

    case "generate":
      return randomBytes(SECRET_BYTES).toString("hex");

    case "none":
      return "";
  }
};

const relaySecret = await chosenSecret();

if (delivery.kind === "relay" && relaySecret === "") {
  throw new Error("a relay needs the secret its host printed — without it every ping is refused");
}

writeConfig({
  delivery,
  machineLabel,
  minIdleMinutes: inherited?.minIdleMinutes ?? DEFAULT_MIN_IDLE_MINUTES,
  staleMinutes: inherited?.staleMinutes ?? DEFAULT_STALE_MINUTES,
  includeUsage: inherited?.includeUsage ?? true,
  askMinutes: inherited?.askMinutes ?? DEFAULT_ASK_MINUTES,
  quoteQuestions: inherited?.quoteQuestions ?? true,
  relaySecret,
  relayPort,
});

console.log(`settings written to ${envFile()}`);

const settings = readJsonFile<ClaudeSettings>(claudeSettingsFile(), {});

mkdirSync(claudeHome(), { recursive: true });

writeFileSync(
  claudeSettingsFile(),
  `${JSON.stringify(registerHooks(settings, REGISTRATIONS, OWNED_MARKERS), null, JSON_INDENT)}\n`,
  "utf8"
);

console.log(`hooks registered in ${claudeSettingsFile()}`);

const memory = existsSync(claudeMemoryFile()) ? readFileSync(claudeMemoryFile(), "utf8") : "";
const withRule = withMemoryRule(memory, `${process.execPath} ${notifyEntry}`);

if (withRule !== memory) {
  writeFileSync(claudeMemoryFile(), withRule, "utf8");
  console.log(`rule added to ${claudeMemoryFile()}`);
} else {
  console.log("rule already present in the global CLAUDE.md");
}

if (hosting) {
  writeFileSync(startupRelayFile(), startupScript(process.execPath, relayEntry), "utf8");

  console.log(`relay set to start at login: ${startupRelayFile()}`);
  console.log("  it runs as a minimised console window — closing that window stops the relay");
  console.log("\nOnce, from an elevated PowerShell, let the port in:");
  console.log(
    `  netsh advfirewall firewall add rule name="claude-notify relay" dir=in action=allow protocol=TCP localport=${relayPort}`
  );
  console.log("\nThen, on the machine that cannot reach Telegram:");
  console.log(
    `  npm run setup -- --relay-url http://<this-machine>:${relayPort} --relay-secret ${relaySecret} --label work`
  );
}

if (!values["skip-test"]) {
  const greeting = `[setup@${machineLabel}] claude-notify подключён на этой машине`;

  switch (delivery.kind) {
    case "telegram":
      await sendMessage(delivery.token, delivery.chatId, greeting);
      break;

    case "relay":
      await relayMessage(delivery.url, relaySecret, greeting);
      break;
  }

  console.log("test message sent — check Telegram");
}

console.log("\nDone. Restart Claude Code so the new hooks load.");
