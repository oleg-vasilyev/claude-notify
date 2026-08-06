import { copy } from "#domain/copy.ts";
import { projectPrefixOf } from "#domain/project.ts";


const TURN_END_RATE_LIMIT_MINUTES = 10;
const QUESTION_RATE_LIMIT_MINUTES = 2;
const LONGEST_QUOTED_QUESTION = 180;
const ELLIPSIS = "…";

export const HOOK_EVENTS = ["Stop", "PreToolUse", "PermissionRequest", "Notification"] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export type HookPayload = {
  cwd?: string;
  tool_name?: string;
  message?: string;
  tool_input?: {
    questions?: { question?: string }[];
  };
};

export type HookPing = {
  message: string;
  rateLimitMinutes: number;
};

export const isHookEvent = (candidate: string): candidate is HookEvent =>
  (HOOK_EVENTS as readonly string[]).includes(candidate);

const shortened = (text: string): string => {
  if (text.length <= LONGEST_QUOTED_QUESTION) {
    return text;
  }

  return `${text.slice(0, LONGEST_QUOTED_QUESTION - ELLIPSIS.length)}${ELLIPSIS}`;
};

const whatIsBeingAsked = (payload: HookPayload): string | undefined => {
  if (payload.tool_name === "ExitPlanMode") {
    return copy.planReady;
  }

  const asked = payload.tool_input?.questions?.[0]?.question;

  if (asked === undefined || asked === "") {
    return undefined;
  }

  return shortened(copy.question(asked));
};

export const pingFor = (event: HookEvent, payload: HookPayload): HookPing => {
  const project = projectPrefixOf(payload.cwd);

  switch (event) {
    case "Stop":
      return {
        message: project + copy.turnEnded,
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };

    case "PreToolUse":
      return {
        message: project + (whatIsBeingAsked(payload) ?? copy.awaitingAnswer),
        rateLimitMinutes: QUESTION_RATE_LIMIT_MINUTES,
      };

    case "PermissionRequest":
      return {
        message: project + copy.permissionWanted(payload.tool_name ?? copy.someTool),
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };

    case "Notification":
      return {
        message: project + (payload.message ?? copy.awaitingAnswer),
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };
  }
};
