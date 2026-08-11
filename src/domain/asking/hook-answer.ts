import { copy } from "#domain/copy.ru.ts";
import type { ReceivedAnswer } from "#domain/asking/answer.ts";
import type { HookEvent } from "#domain/ping/hook-ping.ts";
import { ALLOW, QUESTION_KIND, type AskedQuestion } from "#domain/asking/question.ts";


const LET_IT_THROUGH = {};

type Decision = "allow" | "deny";

const decisionOutput = (
  event: HookEvent,
  decision: Decision,
  reason: string
): Record<string, unknown> => ({
  hookSpecificOutput: {
    hookEventName: event,
    permissionDecision: decision,
    permissionDecisionReason: reason,
  },
});

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
      answer.chosenValue === ALLOW ? "allow" : "deny",
      copy.permissionAnsweredFromPhone(answer.said)
    );
  }

  return decisionOutput(event, "deny", copy.answeredFromPhone(answer.said));
};
