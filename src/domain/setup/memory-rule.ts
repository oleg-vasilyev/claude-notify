import { copy } from "#domain/copy.ru.ts";


export const MEMORY_RULE_HEADING = "# Telegram notifications when user action is needed";

export const memoryRule = (pingCommand: string): string =>
  `${MEMORY_RULE_HEADING}

The user often steps away from the laptop during long tasks. Whenever you are about to end a turn that requires their action - you asked a question, finished a phase and are waiting for approval, or are blocked on their input - send a Telegram ping first:

\`\`\`
${pingCommand} --message "<message>"
\`\`\`

Message: short, in Russian, starts with the project name in brackets, says what is needed. Example: \`${copy.pingExample}\`. Keep under ~200 chars.

Do NOT send it for routine turn ends where nothing is needed from the user - only when you are actually waiting on them. Always just call it and let it decide: it silently queues the ping while the user is still at the keyboard and delivers it once they step away.
`;

const NEXT_TOP_LEVEL_HEADING = /^# /m;

export const withMemoryRule = (existing: string, pingCommand: string): string => {
  const fresh = memoryRule(pingCommand);
  const headingAt = existing.indexOf(MEMORY_RULE_HEADING);

  if (headingAt < 0) {
    const separator = existing.trim() === "" ? "" : "\n\n";

    return `${existing.trimEnd()}${separator}${fresh}`;
  }

  const before = existing.slice(0, headingAt);
  const rest = existing.slice(headingAt + MEMORY_RULE_HEADING.length);
  const nextHeading = NEXT_TOP_LEVEL_HEADING.exec(rest);
  const after = nextHeading === null ? "" : rest.slice(nextHeading.index);

  if (`${before}${fresh}${after}` === existing) {
    return existing;
  }

  return `${before}${fresh}${after === "" ? "" : `\n${after}`}`;
};
