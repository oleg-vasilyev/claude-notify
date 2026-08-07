import { copy } from "#domain/copy.ts";
import { projectPrefixOf } from "#domain/project.ts";


const TURN_END_RATE_LIMIT_MINUTES = 10;
const QUESTION_RATE_LIMIT_MINUTES = 2;
const LONGEST_QUOTED_QUESTION = 180;
const ELLIPSIS = "…";
const NOTHING_RUNNING = 0;

export const HOOK_EVENTS = ["Stop", "PreToolUse", "PermissionRequest", "Notification"] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export type HookPayload = {
  cwd?: string;
  tool_name?: string;
  message?: string;
  background_tasks?: unknown[];
  tool_input?: {
    questions?: {
      question?: string;
      options?: { label?: string; description?: string }[];
    }[];
  };
};

export type HookPing = {
  message: string;
  rateLimitMinutes: number;
};

export const isHookEvent = (candidate: string): candidate is HookEvent =>
  (HOOK_EVENTS as readonly string[]).includes(candidate);

export const stillWorking = (event: HookEvent, payload: HookPayload): boolean =>
  event === "Stop" && (payload.background_tasks ?? []).length > NOTHING_RUNNING;

const shortened = (text: string): string => {
  if (text.length <= LONGEST_QUOTED_QUESTION) {
    return text;
  }

  return `${text.slice(0, LONGEST_QUOTED_QUESTION - ELLIPSIS.length)}${ELLIPSIS}`;
};

const whatIsBeingAsked = (payload: HookPayload, quoting: boolean): string | undefined => {
  if (payload.tool_name === "ExitPlanMode") {
    return copy.planReady;
  }

  if (!quoting) {
    return undefined;
  }

  const asked = payload.tool_input?.questions?.[0]?.question;

  if (asked === undefined || asked === "") {
    return undefined;
  }

  return shortened(copy.question(asked));
};

export const pingFor = (
  event: HookEvent,
  payload: HookPayload,
  quoting: boolean
): HookPing => {
  const project = projectPrefixOf(payload.cwd);

  switch (event) {
    case "Stop":
      return {
        message: project + copy.turnEnded,
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };

    case "PreToolUse":
      return {
        message: project + (whatIsBeingAsked(payload, quoting) ?? copy.awaitingAnswer),
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
