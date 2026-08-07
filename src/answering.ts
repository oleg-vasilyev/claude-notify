import { answersIn, highestUpdateId } from "#domain/answer.ts";
import { copy } from "#domain/copy.ts";
import type { Config } from "#state/config.ts";
import { readAskedQuestions, writeAnswer } from "#state/asked-question.ts";
import { log } from "#state/log.ts";
import { readUpdateOffset, writeUpdateOffset } from "#state/update-offset.ts";
import { answerCallback, closeQuestion, fetchUpdates } from "#telegram/telegram-api.ts";


const NOTHING = 0;

export type AnsweringOutcome = "nothing-asked" | "collected" | "failed";

export const collectAnswers = async (
  config: Config,
  longPollSeconds: number
): Promise<AnsweringOutcome> => {
  const questions = readAskedQuestions();

  if (questions.length === NOTHING) {
    return "nothing-asked";
  }

  let updates;

  try {
    updates = await fetchUpdates(config.token, readUpdateOffset(), longPollSeconds);
  } catch (failure) {
    log(`WARN getUpdates failed: ${String(failure)}`);

    return "failed";
  }

  const seen = highestUpdateId(updates);

  if (seen !== null) {
    writeUpdateOffset(seen);
  }

  for (const matched of answersIn(updates, questions, config.chatId)) {
    writeAnswer(matched.id, matched.answer);
    log(`ANSWER ${matched.id} | ${matched.answer.said}`);

    if (matched.answer.callbackId !== null) {
      await answerCallback(config.token, matched.answer.callbackId);
    }

    const asked = questions.find((question) => question.id === matched.id);

    if (asked?.messageId !== null && asked?.messageId !== undefined) {
      await closeQuestion(
        config.token,
        config.chatId,
        asked.messageId,
        copy.questionClosedWith(asked.headline, matched.answer.said)
      );
    }
  }

  return "collected";
};
