import { decideDelivery, DELIVERY_VERDICT } from "#domain/ping/delivery.ts";
import { impossible } from "#domain/impossible.ts";
import { PING_OUTCOME, type PingOutcome } from "#domain/ping/ping-tool.ts";
import { projectKeyOf, withMachineLabel } from "#domain/project.ts";
import { usageLine } from "#domain/ping/usage.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { relayMessage } from "#relay/relay-client.ts";
import { DELIVERY, readConfig, type Delivery } from "#state/config.ts";
import { readLastSentAt, writeLastSentAt } from "#state/last-sent.ts";
import { log } from "#state/log.ts";
import { appendPending } from "#state/pending-queue.ts";
import { sendMessage } from "#telegram/telegram-api.ts";
import { fetchUsage } from "#usage/usage-api.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


export type PingRequest = {
  message: string;
  rateLimitMinutes: number;
  transcriptPath?: string | null;
  ignorePresence?: boolean;
};

const sendVia = async (delivery: Delivery, text: string): Promise<void> => {
  switch (delivery.kind) {
    case DELIVERY.telegram:
      await sendMessage(delivery.token, delivery.chatId, text);

      return;

    case DELIVERY.relay:
      await relayMessage(delivery.url, delivery.secret, text);

      return;

    default:
      return impossible(delivery);
  }
};

const sentVia = (delivery: Delivery): string => {
  switch (delivery.kind) {
    case DELIVERY.telegram:
      return "SENT";

    case DELIVERY.relay:
      return "SENT via relay";

    default:
      return impossible(delivery);
  }
};

const withUsage = async (message: string): Promise<string> => {
  const line = usageLine(await fetchUsage(), new Date());

  if (line === "") {
    log("WARN usage unavailable");

    return message;
  }

  return `${message}\n\n${line}`;
};

export const deliver = async (request: PingRequest): Promise<PingOutcome> => {
  const config = readConfig();

  if (config === null) {
    return { kind: PING_OUTCOME.unconfigured };
  }

  const message = withMachineLabel(request.message, config.machineLabel);
  const project = projectKeyOf(request.message);

  const verdict = decideDelivery({
    idleSeconds: request.ignorePresence === true ? Number.MAX_SAFE_INTEGER : idleSeconds(),
    minIdleMinutes: config.minIdleMinutes,
    rateLimitMinutes: request.rateLimitMinutes,
    lastSentAt: readLastSentAt(project),
    now: Date.now(),
  });

  switch (verdict.kind) {
    case DELIVERY_VERDICT.queue:
      appendPending({
        queuedAt: Date.now(),
        message,
        transcriptPath: request.transcriptPath ?? null,
      });
      log(`QUEUED idle=${verdict.idleSeconds}s | ${message}`);

      if (!watcherIsRunning()) {
        startWatcher();
      }

      return { kind: PING_OUTCOME.queued, idleSeconds: verdict.idleSeconds };

    case DELIVERY_VERDICT.skip:
      log(`SKIP rate-limit [${project}] | ${message}`);

      return { kind: PING_OUTCOME.skipped, sinceLastSentMinutes: verdict.sinceLastSentMinutes };

    case DELIVERY_VERDICT.send:
      break;

    default:
      return impossible(verdict);
  }

  const text = config.includeUsage ? await withUsage(message) : message;

  try {
    await sendVia(config.delivery, text);
    writeLastSentAt(project, Date.now());
    log(`${sentVia(config.delivery)} | ${text.replaceAll("\n", " | ")}`);

    return { kind: PING_OUTCOME.sent };
  } catch (failure) {
    log(`ERROR send failed: ${String(failure)} | ${message}`);
    process.exitCode = 1;

    return { kind: PING_OUTCOME.failed, why: String(failure) };
  }
};
