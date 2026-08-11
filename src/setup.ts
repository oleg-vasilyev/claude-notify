import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { copy } from "#domain/copy.ru.ts";
import type { ClaudeSettings, HookCommand, Registration } from "#domain/setup/hook-registration.ts";
import { registerHooks } from "#domain/setup/hook-registration.ts";
import { impossible } from "#domain/impossible.ts";
import { withMemoryRule } from "#domain/setup/memory-rule.ts";
import { relayWanted, SECRET_CHOICE, secretChoice, type Inherited } from "#domain/setup/setup-choice.ts";
import { startupScript } from "#domain/setup/startup-script.ts";
import { numberOr } from "#domain/written-number.ts";
import { relayAnswers, relayMessage } from "#relay/relay-client.ts";
import {
  DELIVERY,
  readConfigFrom,
  writeConfig,
  type Delivery,
  type TelegramDelivery,
} from "#state/config.ts";
import {
  claudeHome,
  claudeMemoryFile,
  claudeSettingsFile,
  envFile,
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

const inherited = readConfigFrom(envFile());

const inheritedToken =
  inherited?.delivery.kind === DELIVERY.telegram ? inherited.delivery.token : undefined;
const inheritedChatId =
  inherited?.delivery.kind === DELIVERY.telegram ? inherited.delivery.chatId : undefined;
const inheritedRelayUrl = inherited?.delivery.kind === DELIVERY.relay ? inherited.delivery.url : undefined;
const inheritedSecret =
  inherited?.delivery.kind === DELIVERY.relay ? inherited.delivery.secret : inherited?.hosting?.secret;
const inheritedHosting = inherited?.hosting ?? null;

const telegramDelivery = async (): Promise<TelegramDelivery> => {
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

  return { kind: DELIVERY.telegram, token, chatId };
};

const relayUrlThatAnswers = async (): Promise<string> => {
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

  return url;
};

const asked = {
  relayUrl: values["relay-url"],
  token: values.token,
  secret: values["relay-secret"],
};

const carriedOver: Inherited = {
  sendsThroughARelay: inheritedRelayUrl !== undefined,
  secret: inheritedSecret ?? "",
};

const sendingThroughARelay = relayWanted(asked, carriedOver);
const relayUrl = sendingThroughARelay ? await relayUrlThatAnswers() : "";
const direct = sendingThroughARelay ? null : await telegramDelivery();

const machineLabel =
  values.label ?? inherited?.machineLabel ?? (await ask("Machine label (home / work): "));

const hosting =
  direct !== null && (values["relay-port"] !== undefined || inheritedHosting !== null);
const relayPort = numberOr(values["relay-port"], inheritedHosting?.port ?? DEFAULT_RELAY_PORT);

const chosenSecret = async (): Promise<string> => {
  const choice = secretChoice(asked, carriedOver, sendingThroughARelay, hosting);

  switch (choice.kind) {
    case SECRET_CHOICE.use:
      return choice.secret;

    case SECRET_CHOICE.ask:
      return ask("Relay secret (the one its host printed): ");

    case SECRET_CHOICE.generate:
      return randomBytes(SECRET_BYTES).toString("hex");

    case SECRET_CHOICE.none:
      return "";

    default:
      return impossible(choice);
  }
};

const relaySecret = await chosenSecret();

if (sendingThroughARelay && relaySecret === "") {
  throw new Error("a relay needs the secret its host printed — without it every ping is refused");
}

const delivery: Delivery = direct ?? { kind: DELIVERY.relay, url: relayUrl, secret: relaySecret };

writeConfig({
  delivery,
  machineLabel,
  minIdleMinutes: inherited?.minIdleMinutes ?? DEFAULT_MIN_IDLE_MINUTES,
  staleMinutes: inherited?.staleMinutes ?? DEFAULT_STALE_MINUTES,
  includeUsage: inherited?.includeUsage ?? true,
  askMinutes: inherited?.askMinutes ?? DEFAULT_ASK_MINUTES,
  quoteQuestions: inherited?.quoteQuestions ?? true,
  hosting: hosting ? { port: relayPort, secret: relaySecret } : null,
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
  const greeting = copy.installed(machineLabel);

  switch (delivery.kind) {
    case DELIVERY.telegram:
      await sendMessage(delivery.token, delivery.chatId, greeting);
      break;

    case DELIVERY.relay:
      await relayMessage(delivery.url, delivery.secret, greeting);
      break;

    default:
      impossible(delivery);
  }

  console.log("test message sent — check Telegram");
}

console.log("\nDone. Restart Claude Code so the new hooks load.");
