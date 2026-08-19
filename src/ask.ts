import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { callbackDataFor } from "#domain/asking/answer.ts";
import { ASK_VERDICT, decideAsk } from "#domain/asking/asking.ts";
import { copy } from "#domain/copy.ru.ts";
import { hookAnswerOutput } from "#domain/asking/hook-answer.ts";
import { impossible } from "#domain/impossible.ts";
import type { HookEvent, HookPayload } from "#domain/hook-event.ts";
import { projectPrefixOf, withMachineLabel } from "#domain/project.ts";
import { messageWith } from "#domain/telegram-html.ts";
import { questionText } from "#domain/asking/question.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { forgetQuestion, readAnswer, writeAskedQuestion } from "#state/asked-question.ts";
import { DELIVERY, readConfig } from "#state/config.ts";
import { log } from "#state/log.ts";
import { closeQuestion, sendQuestion } from "#telegram/telegram-api.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


const ID_LENGTH = 8;
const CHECK_EVERY_MS = 1000;
const MILLISECONDS_PER_MINUTE = 60_000;

export const ask = async (
  event: HookEvent,
  payload: HookPayload
): Promise<Record<string, unknown> | null> => {
  const config = readConfig();

  if (config === null) {
    return null;
  }

  const delivery = config.delivery;

  if (delivery.kind !== DELIVERY.telegram) {
    return null;
  }

  const verdict = decideAsk({
    event,
    payload,
    id: randomUUID().replaceAll("-", "").slice(0, ID_LENGTH),
    idleSeconds: idleSeconds(),
    minIdleMinutes: config.minIdleMinutes,
    askEnabled: config.askMinutes > 0,
    quoting: config.quoteQuestions,
  });

  switch (verdict.kind) {
    case ASK_VERDICT.present:
      log(`ASK skipped, at the keyboard ${verdict.idleSeconds}s | ${event}`);

      return null;

    case ASK_VERDICT.unaskable:
      return null;

    case ASK_VERDICT.ask:
      break;

    default:
      return impossible(verdict);
  }

  const question = verdict.question;
  const text = withMachineLabel(
    questionText(question, projectPrefixOf(payload.cwd)),
    config.machineLabel
  );
  const headline = text.split("\n")[0] ?? text;

  let messageId: number | null;

  try {
    messageId = await sendQuestion(
      delivery.token,
      delivery.chatId,
      messageWith(text, ""),
      question.options.map((option) => ({
        text: option.recommended ? `★ ${option.label}` : option.label,
        data: callbackDataFor(question.id, option.value),
      }))
    );
  } catch (failure) {
    log(`ERROR ask send failed: ${String(failure)}`);

    return null;
  }

  writeAskedQuestion(question, messageId, headline);
  log(`ASKED ${question.id} ${question.kind} | ${text.replaceAll("\n", " | ")}`);

  if (!watcherIsRunning()) {
    startWatcher();
  }

  const deadline = Date.now() + config.askMinutes * MILLISECONDS_PER_MINUTE;

  while (Date.now() < deadline) {
    const answer = readAnswer(question.id);

    if (answer !== null) {
      forgetQuestion(question.id);
      log(`ANSWERED ${question.id} | ${answer.said}`);

      return hookAnswerOutput(event, question, answer);
    }

    await sleep(CHECK_EVERY_MS);
  }

  forgetQuestion(question.id);
  log(`ASK timed out ${question.id}, handing the question back to the app`);

  if (messageId !== null) {
    await closeQuestion(delivery.token, delivery.chatId, messageId, messageWith(copy.questionExpired(headline), ""));
  }

  return hookAnswerOutput(event, question, null);
};
