import { copy } from "#domain/copy.ru.ts";
import {
  HOOK_EVENT,
  type BackgroundTask,
  type HookEvent,
  type HookPayload,
} from "#domain/hook-event.ts";
import { projectPrefixOf } from "#domain/project.ts";


const TURN_END_RATE_LIMIT_MINUTES = 10;
const QUESTION_RATE_LIMIT_MINUTES = 2;
const LONGEST_QUOTED_QUESTION = 180;
const ELLIPSIS = "…";
const WORK_THAT_HANDS_THE_TURN_BACK = ["subagent", "shell"];
const WORK_THAT_WAITS_ON_SOMETHING_ELSE = ["monitor"];
const RUNNING = "running";
const NO_FIELD = "";

export type HookPing = {
  message: string;
  rateLimitMinutes: number;
};

const asTask = (candidate: unknown): BackgroundTask =>
  typeof candidate === "object" && candidate !== null ? (candidate as BackgroundTask) : {};

const tasksIn = (payload: HookPayload): BackgroundTask[] =>
  Array.isArray(payload.background_tasks) ? payload.background_tasks.map(asTask) : [];

const carriesOn = (task: BackgroundTask): boolean =>
  task.status === RUNNING && WORK_THAT_HANDS_THE_TURN_BACK.includes(task.type ?? NO_FIELD);

const wasJudged = (task: BackgroundTask): boolean =>
  WORK_THAT_WAITS_ON_SOMETHING_ELSE.includes(task.type ?? NO_FIELD) || carriesOn(task);

export const willCarryOn = (event: HookEvent, payload: HookPayload): boolean =>
  event === HOOK_EVENT.stop && tasksIn(payload).some(carriesOn);

export const unfamiliarWork = (payload: HookPayload): string[] => [
  ...new Set(
    tasksIn(payload)
      .filter((task) => !wasJudged(task))
      .map((task) => `${task.type ?? NO_FIELD}/${task.status ?? NO_FIELD}`)
  ),
];

const SCRIPT_RUNS_IT = "sdk-";

export const nobodyIsWatching = (entrypoint: string | undefined): boolean =>
  entrypoint !== undefined && entrypoint.startsWith(SCRIPT_RUNS_IT);


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
): HookPing | null => {
  const project = projectPrefixOf(payload.cwd);

  switch (event) {
    case HOOK_EVENT.userPromptSubmit:
      return null;

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
