import type { HookEvent, HookPayload } from "#domain/hook-ping.ts";
import { questionFrom, type AskedQuestion } from "#domain/question.ts";


const SECONDS_PER_MINUTE = 60;

export type AskFacts = {
  event: HookEvent;
  payload: HookPayload;
  id: string;
  idleSeconds: number;
  minIdleMinutes: number;
  askEnabled: boolean;
};

export type AskVerdict =
  | { kind: "ask"; question: AskedQuestion }
  | { kind: "present"; idleSeconds: number }
  | { kind: "unaskable" };

export const decideAsk = (facts: AskFacts): AskVerdict => {
  if (!facts.askEnabled) {
    return { kind: "unaskable" };
  }

  if (facts.idleSeconds < facts.minIdleMinutes * SECONDS_PER_MINUTE) {
    return { kind: "present", idleSeconds: facts.idleSeconds };
  }

  const question = questionFrom(facts.event, facts.payload, facts.id);

  if (question === null) {
    return { kind: "unaskable" };
  }

  return { kind: "ask", question };
};
