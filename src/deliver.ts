import {
  ATTACHMENT,
  attachmentFor,
  attachmentReport,
  captionFits,
  RATE_LIMIT_TOOK_IT,
  refusedPicture,
  wasAttached,
  WORDS_ARRIVED_WITHOUT_IT,
  type Attachment,
} from "#domain/ping/attachment.ts";
import { decideDelivery, DELIVERY_VERDICT } from "#domain/ping/delivery.ts";
import { impossible } from "#domain/impossible.ts";
import { PING_OUTCOME, type PingOutcome } from "#domain/ping/ping-tool.ts";
import { projectKeyOf, withMachineLabel } from "#domain/project.ts";
import { readoutFor } from "#domain/ping/usage.ts";
import { messageWith } from "#domain/telegram-html.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { relayMessage } from "#relay/relay-client.ts";
import { DELIVERY, readConfig, type Delivery, type TelegramDelivery } from "#state/config.ts";
import { readLastSent, writeLastSent } from "#state/last-sent.ts";
import { rememberedUsage, rememberUsage } from "#state/last-usage.ts";
import { log } from "#state/log.ts";
import { appendPending } from "#state/pending-queue.ts";
import { pictureBytes, sendPicture } from "#telegram/picture.ts";
import { sendMessage } from "#telegram/telegram-api.ts";
import { fetchUsage } from "#usage/usage-api.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


export type PingRequest = {
  message: string;
  rateLimitMinutes: number;
  sessionId?: string | null;
  ignorePresence?: boolean;
  imagePath?: string | null;
};

export type PingResult = { outcome: PingOutcome; picture: Attachment | null };

const NO_CAPTION = "";

const pictureFor = (imagePath: string | null, delivery: Delivery): Attachment | null =>
  imagePath === null || imagePath === ""
    ? null
    : attachmentFor({
        path: imagePath,
        bytes: pictureBytes(imagePath),
        channelCarriesPictures: delivery.kind === DELIVERY.telegram,
      });

const sendToTelegram = async (
  delivery: TelegramDelivery,
  text: string,
  picture: Attachment | null
): Promise<Attachment | null> => {
  if (!wasAttached(picture)) {
    await sendMessage(delivery.token, delivery.chatId, text);

    return picture;
  }

  if (captionFits(text)) {
    await sendPicture(delivery.token, delivery.chatId, picture, text);

    return picture;
  }

  await sendMessage(delivery.token, delivery.chatId, text);

  try {
    await sendPicture(delivery.token, delivery.chatId, picture, NO_CAPTION);
  } catch (failure) {
    return refusedPicture(picture, `${WORDS_ARRIVED_WITHOUT_IT}: ${String(failure)}`);
  }

  return picture;
};

const sendVia = async (
  delivery: Delivery,
  text: string,
  picture: Attachment | null
): Promise<Attachment | null> => {
  switch (delivery.kind) {
    case DELIVERY.telegram:
      return sendToTelegram(delivery, text, picture);

    case DELIVERY.relay:
      await relayMessage(delivery.url, delivery.secret, text);

      return picture;

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

const limitsBlock = async (): Promise<string> => {
  const now = new Date();
  const readout = readoutFor(await fetchUsage(), rememberedUsage(), now);

  if (readout.remember !== null) {
    rememberUsage(readout.remember, now.getTime());
  }

  if (readout.warning !== "") {
    log(`WARN ${readout.warning}`);
  }

  return readout.block;
};

export const deliver = async (request: PingRequest): Promise<PingResult> => {
  const config = readConfig();

  if (config === null) {
    return { outcome: { kind: PING_OUTCOME.unconfigured }, picture: null };
  }

  const message = withMachineLabel(request.message, config.machineLabel);
  const project = projectKeyOf(message);
  const picture = pictureFor(request.imagePath ?? null, config.delivery);
  const report = attachmentReport(picture);

  if (report !== "") {
    log(`WARN ${report}`);
  }

  const verdict = decideDelivery({
    idleSeconds:
      request.ignorePresence === true || wasAttached(picture)
        ? Number.MAX_SAFE_INTEGER
        : idleSeconds(),
    minIdleMinutes: config.minIdleMinutes,
    rateLimitMinutes: request.rateLimitMinutes,
    lastSentAt: readLastSent(project)?.at ?? null,
    now: Date.now(),
  });

  switch (verdict.kind) {
    case DELIVERY_VERDICT.queue:
      appendPending({
        queuedAt: Date.now(),
        message,
        sessionId: request.sessionId ?? null,
      });
      log(`QUEUED idle=${verdict.idleSeconds}s | ${message}`);

      if (!watcherIsRunning()) {
        startWatcher();
      }

      return {
        outcome: { kind: PING_OUTCOME.queued, idleSeconds: verdict.idleSeconds },
        picture,
      };

    case DELIVERY_VERDICT.skip:
      log(`SKIP rate-limit [${project}] | ${message}`);

      return {
        outcome: {
          kind: PING_OUTCOME.skipped,
          sinceLastSentMinutes: verdict.sinceLastSentMinutes,
        },
        picture: wasAttached(picture) ? refusedPicture(picture, RATE_LIMIT_TOOK_IT) : picture,
      };

    case DELIVERY_VERDICT.send:
      break;

    default:
      return impossible(verdict);
  }

  const block = config.includeUsage ? await limitsBlock() : "";
  const text = messageWith(message, block);

  try {
    const carriedPicture = await sendVia(config.delivery, text, picture);
    const carried = wasAttached(carriedPicture) ? `picture ${carriedPicture.name}` : "";
    const written = [message, block, carried].filter((part) => part !== "").join(" | ");

    writeLastSent(project, { at: Date.now(), message });
    log(`${sentVia(config.delivery)} | ${written.replaceAll("\n", " | ")}`);

    if (carriedPicture?.kind === ATTACHMENT.refused) {
      log(`WARN ${attachmentReport(carriedPicture)}`);
    }

    return { outcome: { kind: PING_OUTCOME.sent }, picture: carriedPicture };
  } catch (failure) {
    log(`ERROR send failed: ${String(failure)} | ${message}`);
    process.exitCode = 1;

    return { outcome: { kind: PING_OUTCOME.failed, why: String(failure) }, picture };
  }
};
