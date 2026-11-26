import { impossible } from "#domain/impossible.ts";


export const TURN_OWNER = {
  user: "user",
  anotherSession: "another-session",
} as const;

export type TurnOwner = (typeof TURN_OWNER)[keyof typeof TURN_OWNER];

export const PROMPT_ORIGIN = {
  user: "user",
  anotherSession: "another-session",
  ownWork: "own-work",
} as const;

export type PromptOrigin = (typeof PROMPT_ORIGIN)[keyof typeof PROMPT_ORIGIN];

const LEADING_REMINDER = /^\s*<system-reminder>([\s\S]*?)<\/system-reminder>/;
const REPORT_FROM_A_SIDE_SESSION = /^\s*The session ".*?" you started \(local_[^)]*\) finished a turn/;
const WHERE_THE_QUOTED_REPORT_BEGINS = "It reported";
const SIDE_SESSION_ID = /Its Claude Code session is ([0-9a-f-]+)/;
const FIRST_GROUP = 1;
const MESSAGE_FROM_ANOTHER_SESSION =
  /^(?:Another Claude session sent a message:\s*)?<cross-session-message from=/;
const BRIEF_FROM_THE_STARTING_SESSION = /^(?:Task|Background) \(from the session that started this one\):/;
const OWN_WORK_COMING_BACK = [
  /^<task-notification>/,
  /^(?:Another Claude session sent a message:\s*)?<agent-message from=/,
  /^(?:<artifact-content-authored-by-others\/>[^\n]*\n[^\n]*\n)?This session is being continued from a previous conversation/,
  /^I hit my usage limit while you were working/,
];

const OWNER_VALUES = new Set<string>(Object.values(TURN_OWNER));

export const isTurnOwner = (candidate: unknown): candidate is TurnOwner =>
  typeof candidate === "string" && OWNER_VALUES.has(candidate);

const leadingRemindersOf = (prompt: string): { reminders: string[]; body: string } => {
  const reminders: string[] = [];
  let rest = prompt;
  let found = LEADING_REMINDER.exec(rest);

  while (found !== null) {
    reminders.push(found[1] ?? "");
    rest = rest.slice(found[0].length);
    found = LEADING_REMINDER.exec(rest);
  }

  return { reminders, body: rest.trimStart() };
};

const reportsIn = (prompt: string): string[] =>
  leadingRemindersOf(prompt).reminders.filter((reminder) => REPORT_FROM_A_SIDE_SESSION.test(reminder));

const sideSessionIdIn = (report: string): string[] => {
  const beforeTheQuote = report.split(WHERE_THE_QUOTED_REPORT_BEGINS)[0] ?? "";
  const id = SIDE_SESSION_ID.exec(beforeTheQuote)?.[FIRST_GROUP];

  return id === undefined ? [] : [id];
};

export const originOf = (prompt: unknown): PromptOrigin => {
  if (typeof prompt !== "string") {
    return PROMPT_ORIGIN.user;
  }

  if (reportsIn(prompt).length > 0) {
    return PROMPT_ORIGIN.ownWork;
  }

  const { body } = leadingRemindersOf(prompt);

  if (MESSAGE_FROM_ANOTHER_SESSION.test(body) || BRIEF_FROM_THE_STARTING_SESSION.test(body)) {
    return PROMPT_ORIGIN.anotherSession;
  }

  if (OWN_WORK_COMING_BACK.some((marker) => marker.test(body))) {
    return PROMPT_ORIGIN.ownWork;
  }

  return PROMPT_ORIGIN.user;
};

export const ownerAfter = (prompt: unknown, previous: TurnOwner): TurnOwner => {
  const origin = originOf(prompt);

  switch (origin) {
    case PROMPT_ORIGIN.user:
      return TURN_OWNER.user;

    case PROMPT_ORIGIN.anotherSession:
      return TURN_OWNER.anotherSession;

    case PROMPT_ORIGIN.ownWork:
      return previous;

    default:
      return impossible(origin);
  }
};

export const sideSessionsReportingIn = (prompt: unknown): string[] =>
  typeof prompt === "string"
    ? reportsIn(prompt).flatMap(sideSessionIdIn)
    : [];
