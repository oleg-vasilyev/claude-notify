import { copy } from "#domain/copy.ru.ts";
import type { ReceivedAnswer } from "#domain/asking/answer.ts";
import { HOOK_EVENT, type HookEvent } from "#domain/hook-event.ts";
import { ALLOW, QUESTION_KIND, type AskedQuestion } from "#domain/asking/question.ts";


const LET_IT_THROUGH = {};

const decisionOutput = (
  event: HookEvent,
  allow: boolean,
  reason: string
): Record<string, unknown> =>
  event === HOOK_EVENT.permissionRequest
    ? {
        hookSpecificOutput: {
          hookEventName: event,
          decision: { allow, reason },
        },
      }
    : {
        hookSpecificOutput: {
          hookEventName: event,
          permissionDecision: allow ? "allow" : "deny",
          permissionDecisionReason: reason,
        },
      };

export const hookAnswerOutput = (
  event: HookEvent,
  question: AskedQuestion,
  answer: ReceivedAnswer | null
): Record<string, unknown> => {
  if (answer === null) {
    return LET_IT_THROUGH;
  }

  if (question.kind === QUESTION_KIND.permission) {
    if (answer.chosenValue === null) {
      return LET_IT_THROUGH;
    }

    return decisionOutput(
      event,
      answer.chosenValue === ALLOW,
      copy.permissionAnsweredFromPhone(answer.said)
    );
  }

  return decisionOutput(event, false, copy.answeredFromPhone(answer.said));
};
