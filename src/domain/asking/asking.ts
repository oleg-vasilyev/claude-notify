import type { HookEvent, HookPayload } from "#domain/hook-event.ts";
import { questionFrom, QUESTION_KIND, type AskedQuestion } from "#domain/asking/question.ts";


const SECONDS_PER_MINUTE = 60;

export type AskFacts = {
  event: HookEvent;
  payload: HookPayload;
  id: string;
  idleSeconds: number;
  minIdleMinutes: number;
  askEnabled: boolean;
  quoting: boolean;
};

export const ASK_VERDICT = {
  ask: "ask",
  present: "present",
  unaskable: "unaskable",
} as const;

export type AskVerdict =
  | { kind: typeof ASK_VERDICT.ask; question: AskedQuestion }
  | { kind: typeof ASK_VERDICT.present; idleSeconds: number }
  | { kind: typeof ASK_VERDICT.unaskable };

export const decideAsk = (facts: AskFacts): AskVerdict => {
  if (!facts.askEnabled) {
    return { kind: ASK_VERDICT.unaskable };
  }

  if (facts.idleSeconds < facts.minIdleMinutes * SECONDS_PER_MINUTE) {
    return { kind: ASK_VERDICT.present, idleSeconds: facts.idleSeconds };
  }

  const question = questionFrom(facts.event, facts.payload, facts.id);

  if (question === null) {
    return { kind: ASK_VERDICT.unaskable };
  }

  if (!facts.quoting && question.kind === QUESTION_KIND.choice) {
    return { kind: ASK_VERDICT.unaskable };
  }

  return { kind: ASK_VERDICT.ask, question };
};
