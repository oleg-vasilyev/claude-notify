import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { ClaudeSettings, HookCommand, Registration } from "#domain/hook-registration.ts";
import { registerHooks } from "#domain/hook-registration.ts";
import { withMemoryRule } from "#domain/memory-rule.ts";
import { readConfigFrom, writeConfig, type Config } from "#state/config.ts";
import {
  claudeMemoryFile,
  claudeSettingsFile,
  envFile,
  legacyConfigFile,
  powershellConfigFile,
} from "#state/file-locations.ts";
import { botName, resolveChatId, sendMessage } from "#telegram/telegram-api.ts";


const HOOK_TIMEOUT_SECONDS = 30;
const SOUND_TIMEOUT_SECONDS = 15;
const DEFAULT_MIN_IDLE_MINUTES = 3;
const DEFAULT_STALE_MINUTES = 15;
const OWNED_MARKER = "claude-notify";
const OWNED_MARKERS = [OWNED_MARKER, "telegram-notify"];
const JSON_INDENT = 2;

const { values } = parseArgs({
  options: {
    token: { type: "string" },
    label: { type: "string" },
    "skip-test": { type: "boolean", default: false },
  },
});

const hookEntry = fileURLToPath(new URL("./hook.ts", import.meta.url));
const notifyEntry = fileURLToPath(new URL("./notify.ts", import.meta.url));

const pingCommand = (event: string): HookCommand => ({
  type: "command",
  command: process.execPath,
  args: [hookEntry, event, OWNED_MARKER],
  timeout: HOOK_TIMEOUT_SECONDS,
  async: true,
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
    command: pingCommand("PreToolUse"),
  },
  { event: "PermissionRequest", command: pingCommand("PermissionRequest") },
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

const legacyJsonConfig = (path: string): Config | null => {
  const stored = readJsonFile<Record<string, string | number | boolean>>(path, {});

  if (typeof stored.token !== "string" || typeof stored.chat_id !== "string") {
    return null;
  }

  return {
    token: stored.token,
    chatId: stored.chat_id,
    machineLabel: typeof stored.machine_label === "string" ? stored.machine_label : "",
    minIdleMinutes:
      typeof stored.min_idle_minutes === "number"
        ? stored.min_idle_minutes
        : DEFAULT_MIN_IDLE_MINUTES,
    staleMinutes:
      typeof stored.stale_minutes === "number" ? stored.stale_minutes : DEFAULT_STALE_MINUTES,
    includeUsage: stored.include_usage !== false,
  };
};

const inherited =
  readConfigFrom(envFile()) ??
  legacyJsonConfig(legacyConfigFile()) ??
  legacyJsonConfig(powershellConfigFile());

const token = values.token ?? inherited?.token ?? (await ask("Telegram bot token: "));

if (token === "") {
  throw new Error("a bot token is required — create one with @BotFather");
}

const bot = await botName(token);

console.log(`bot ok: @${bot}`);

const chatId =
  inherited !== null && inherited.token === token
    ? inherited.chatId
    : ((await resolveChatId(token)) ??
      (() => {
        throw new Error(`no messages yet — write /start to @${bot} first, then run setup again`);
      })());

console.log(`chat id: ${chatId}`);

const machineLabel =
  values.label ?? inherited?.machineLabel ?? (await ask("Machine label (home / work): "));

writeConfig({
  token,
  chatId,
  machineLabel,
  minIdleMinutes: inherited?.minIdleMinutes ?? DEFAULT_MIN_IDLE_MINUTES,
  staleMinutes: inherited?.staleMinutes ?? DEFAULT_STALE_MINUTES,
  includeUsage: inherited?.includeUsage ?? true,
});

console.log(`settings written to ${envFile()}`);

const settings = readJsonFile<ClaudeSettings>(claudeSettingsFile(), {});

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

if (!values["skip-test"]) {
  await sendMessage(token, chatId, `[setup@${machineLabel}] claude-notify подключён на этой машине`);
  console.log("test message sent — check Telegram");
}

console.log("\nDone. Restart Claude Code so the new hooks load.");
