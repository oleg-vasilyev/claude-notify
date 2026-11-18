import { copy } from "#domain/copy.ru.ts";
import {
  HOOK_EVENT,
  type BackgroundTask,
  type HookEvent,
  type HookPayload,
} from "#domain/hook-event.ts";
import { replyAsksAQuestion } from "#domain/ping/question-in-reply.ts";
import { commandNeverExits } from "#domain/ping/endless-command.ts";
import { projectPrefixOf } from "#domain/project.ts";


const TURN_END_RATE_LIMIT_MINUTES = 10;
const QUESTION_RATE_LIMIT_MINUTES = 2;
const LONGEST_QUOTED_QUESTION = 180;
const ELLIPSIS = "…";
const WORK_THAT_HANDS_THE_TURN_BACK = ["subagent", "shell", "monitor"];
const SHELL = "shell";
const MONITOR = "monitor";
const NO_SERVER = "no server";
const NO_STATUS = "no status";
const RUNNING = "running";
const NO_FIELD = "";
const LONGEST_FAILURE_REASON = 120;

export type HookPing = {
  message: string;
  rateLimitMinutes: number;
};

const asTask = (candidate: unknown): BackgroundTask =>
  typeof candidate === "object" && candidate !== null ? (candidate as BackgroundTask) : {};

const tasksIn = (payload: HookPayload): BackgroundTask[] =>
  Array.isArray(payload.background_tasks) ? payload.background_tasks.map(asTask) : [];

const endlessCommandOf = (task: BackgroundTask): string[] =>
  task.status === RUNNING &&
  task.type === SHELL &&
  typeof task.command === "string" &&
  commandNeverExits(task.command)
    ? [task.command]
    : [];

const serverOf = (task: BackgroundTask): string | null =>
  typeof task.server === "string" && task.server !== "" ? task.server : null;

const isASubscription = (task: BackgroundTask): boolean =>
  task.type === MONITOR && serverOf(task) !== null;

const carriesOn = (task: BackgroundTask): boolean =>
  task.status === RUNNING &&
  WORK_THAT_HANDS_THE_TURN_BACK.includes(task.type ?? NO_FIELD) &&
  !isASubscription(task) &&
  endlessCommandOf(task).length === 0;

const wasJudged = (task: BackgroundTask): boolean =>
  task.type === MONITOR || carriesOn(task) || endlessCommandOf(task).length > 0;

export const monitorsIn = (payload: HookPayload): string[] =>
  tasksIn(payload)
    .filter((task) => task.type === MONITOR)
    .map(
      (task) =>
        `${serverOf(task) ?? NO_SERVER} | ${task.status ?? NO_STATUS} | ${typeof task.description === "string" ? task.description : NO_FIELD}`
    );

export const willCarryOn = (event: HookEvent, payload: HookPayload): boolean =>
  event === HOOK_EVENT.stop &&
  !replyAsksAQuestion(payload.last_assistant_message) &&
  tasksIn(payload).some(carriesOn);

export const endlessWork = (payload: HookPayload): string[] =>
  tasksIn(payload).flatMap(endlessCommandOf);

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


const shortened = (text: string, longest: number): string => {
  if (text.length <= longest) {
    return text;
  }

  return `${text.slice(0, longest - ELLIPSIS.length)}${ELLIPSIS}`;
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

  return shortened(copy.question(asked), LONGEST_QUOTED_QUESTION);
};

const whyTheTurnFailed = (payload: HookPayload): string =>
  typeof payload.error === "string" && payload.error !== ""
    ? copy.turnFailedWith(shortened(payload.error, LONGEST_FAILURE_REASON))
    : copy.turnFailed;

export const turnEndPing = (payload: HookPayload): HookPing => ({
  message: projectPrefixOf(payload.cwd) + copy.turnEnded,
  rateLimitMinutes: TURN_END_RATE_LIMIT_MINUTES,
});

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
      return turnEndPing(payload);

    case HOOK_EVENT.stopFailure:
      return {
        message: project + whyTheTurnFailed(payload),
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
