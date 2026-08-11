import { copy } from "#domain/copy.ru.ts";
import { HOOK_EVENT, type HookEvent, type HookPayload } from "#domain/hook-event.ts";
import { projectPrefixOf } from "#domain/project.ts";


const TURN_END_RATE_LIMIT_MINUTES = 10;
const QUESTION_RATE_LIMIT_MINUTES = 2;
const LONGEST_QUOTED_QUESTION = 180;
const ELLIPSIS = "…";
const NOTHING_RUNNING = 0;

export type HookPing = {
  message: string;
  rateLimitMinutes: number;
};

export const stillWorking = (event: HookEvent, payload: HookPayload): boolean =>
  event === HOOK_EVENT.stop && (payload.background_tasks ?? []).length > NOTHING_RUNNING;

export const transcriptToWatch = (event: HookEvent, payload: HookPayload): string | null =>
  event === HOOK_EVENT.stop ? (payload.transcript_path ?? null) : null;

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
    case HOOK_EVENT.stop:
      return {
        message: project + copy.turnEnded,
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };

    case HOOK_EVENT.preToolUse:
      return {
        message: project + (whatIsBeingAsked(payload, quoting) ?? copy.awaitingAnswer),
        rateLimitMinutes: QUESTION_RATE_LIMIT_MINUTES,
      };

    case HOOK_EVENT.permissionRequest:
      return {
        message: project + copy.permissionWanted(payload.tool_name ?? copy.someTool),
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };

    case HOOK_EVENT.notification:
      return {
        message: project + (payload.message ?? copy.awaitingAnswer),
        rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
      };
  }
};
