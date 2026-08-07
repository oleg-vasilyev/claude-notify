import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { callbackDataFor } from "#domain/answer.ts";
import { decideAsk } from "#domain/asking.ts";
import { hookAnswerOutput } from "#domain/hook-answer.ts";
import type { HookEvent, HookPayload } from "#domain/hook-ping.ts";
import { projectPrefixOf, withMachineLabel } from "#domain/project.ts";
import { questionText } from "#domain/question.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { forgetQuestion, readAnswer, writeAskedQuestion } from "#state/asked-question.ts";
import { readConfig } from "#state/config.ts";
import { log } from "#state/log.ts";
import { sendQuestion } from "#telegram/telegram-api.ts";
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

  const verdict = decideAsk({
    event,
    payload,
    id: randomUUID().replaceAll("-", "").slice(0, ID_LENGTH),
    idleSeconds: idleSeconds(),
    minIdleMinutes: config.minIdleMinutes,
    askEnabled: config.askMinutes > 0,
  });

  switch (verdict.kind) {
    case "present":
      log(`ASK skipped, at the keyboard ${verdict.idleSeconds}s | ${event}`);

      return null;

    case "unaskable":
      return null;

    case "ask":
      break;
  }

  const question = verdict.question;
  const text = withMachineLabel(
    questionText(question, projectPrefixOf(payload.cwd)),
    config.machineLabel
  );

  writeAskedQuestion(question);

  try {
    await sendQuestion(
      config.token,
      config.chatId,
      text,
      question.options.map((option) => ({
        text: option.recommended ? `★ ${option.label}` : option.label,
        data: callbackDataFor(question.id, option.value),
      }))
    );
  } catch (failure) {
    forgetQuestion(question.id);
    log(`ERROR ask send failed: ${String(failure)}`);

    return null;
  }

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

  return hookAnswerOutput(event, question, null);
};
