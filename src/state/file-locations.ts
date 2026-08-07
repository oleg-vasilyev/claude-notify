import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";


export const projectHome = (): string => fileURLToPath(new URL("../..", import.meta.url));

export const envFile = (): string => process.env.CLAUDE_NOTIFY_ENV ?? join(projectHome(), ".env");

export const claudeHome = (): string => join(homedir(), ".claude");

export const stateHome = (): string =>
  process.env.CLAUDE_NOTIFY_HOME ?? join(claudeHome(), "claude-notify");

export const legacyConfigFile = (): string => join(stateHome(), "config.json");

export const logFile = (): string => join(stateHome(), "log.txt");

export const pendingFile = (): string => join(stateHome(), "pending.jsonl");

export const watcherLockFile = (): string => join(stateHome(), "watcher.lock");

export const lastSentFile = (project: string): string =>
  join(stateHome(), `last-sent-${project}.txt`);

export const askedQuestionFile = (id: string): string =>
  join(stateHome(), `question-${id}.json`);

export const answerFile = (id: string): string => join(stateHome(), `answer-${id}.json`);

export const updateOffsetFile = (): string => join(stateHome(), "update-offset.txt");

export const claudeSettingsFile = (): string => join(claudeHome(), "settings.json");

export const claudeMemoryFile = (): string => join(claudeHome(), "CLAUDE.md");

export const credentialsFile = (): string => join(claudeHome(), ".credentials.json");

export const powershellConfigFile = (): string =>
  join(claudeHome(), "scripts", "telegram-notify", "config.json");
