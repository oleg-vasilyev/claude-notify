import { copy } from "#domain/copy.ts";
import type { ReceivedAnswer } from "#domain/answer.ts";
import type { HookEvent } from "#domain/hook-ping.ts";
import { ALLOW, type AskedQuestion } from "#domain/question.ts";


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

  if (question.kind === "permission") {
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
