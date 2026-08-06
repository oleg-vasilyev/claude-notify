import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";


export const projectHome = (): string => fileURLToPath(new URL("../..", import.meta.url));

export const envFile = (): string => join(projectHome(), ".env");

export const claudeHome = (): string => join(homedir(), ".claude");

export const stateHome = (): string => join(claudeHome(), "claude-notify");

export const legacyConfigFile = (): string => join(stateHome(), "config.json");

export const logFile = (): string => join(stateHome(), "log.txt");

export const pendingFile = (): string => join(stateHome(), "pending.jsonl");

export const watcherLockFile = (): string => join(stateHome(), "watcher.lock");

export const lastSentFile = (project: string): string =>
  join(stateHome(), `last-sent-${project}.txt`);

export const claudeSettingsFile = (): string => join(claudeHome(), "settings.json");

export const claudeMemoryFile = (): string => join(claudeHome(), "CLAUDE.md");

export const credentialsFile = (): string => join(claudeHome(), ".credentials.json");

export const powershellConfigFile = (): string =>
  join(claudeHome(), "scripts", "telegram-notify", "config.json");
