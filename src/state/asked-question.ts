import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ReceivedAnswer } from "#domain/answer.ts";
import type { AskedQuestion } from "#domain/question.ts";
import { answerFile, askedQuestionFile, stateHome } from "#state/file-locations.ts";


const QUESTION_PREFIX = "question-";
const QUESTION_SUFFIX = ".json";

const readJson = <T>(path: string): T | null => {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
};

export type PendingQuestion = AskedQuestion & { messageId: number | null; headline: string };

export const writeAskedQuestion = (
  question: AskedQuestion,
  messageId: number | null,
  headline: string
): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(
    askedQuestionFile(question.id),
    JSON.stringify({ ...question, messageId, headline }),
    "utf8"
  );
};

export const readAskedQuestions = (): PendingQuestion[] => {
  if (!existsSync(stateHome())) {
    return [];
  }

  return readdirSync(stateHome())
    .filter((name) => name.startsWith(QUESTION_PREFIX) && name.endsWith(QUESTION_SUFFIX))
    .flatMap((name) => {
      const question = readJson<PendingQuestion>(join(stateHome(), name));

      return question === null ? [] : [question];
    });
};

export const writeAnswer = (id: string, answer: ReceivedAnswer): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(answerFile(id), JSON.stringify(answer), "utf8");
};

export const readAnswer = (id: string): ReceivedAnswer | null =>
  readJson<ReceivedAnswer>(answerFile(id));

export const forgetQuestion = (id: string): void => {
  rmSync(askedQuestionFile(id), { force: true });
  rmSync(answerFile(id), { force: true });
};
