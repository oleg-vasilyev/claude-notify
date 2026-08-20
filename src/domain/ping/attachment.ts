import { impossible } from "#domain/impossible.ts";


const BYTES_PER_MEGABYTE = 1024 * 1024;
const TELEGRAM_FILE_LIMIT_BYTES = 50 * BYTES_PER_MEGABYTE;
const TELEGRAM_CAPTION_LIMIT = 1024;
const NOTHING_IN_IT = 0;
const AT_THE_START = 0;
const PICTURE_SUFFIXES = ["png", "jpg", "jpeg", "gif", "webp"];
const NO_SUFFIX = "";
const PATH_SEPARATOR = /[\\/]/;
const SUFFIX_SEPARATOR = ".";
const AFTER_THE_DOT = 1;
const THE_LAST_ONE = 1;

export const ATTACHMENT = {
  ready: "ready",
  missing: "missing",
  empty: "empty",
  tooBig: "too-big",
  unsupported: "unsupported",
  noChannel: "no-channel",
  refused: "refused",
} as const;

export type ReadyPicture = { kind: typeof ATTACHMENT.ready; path: string; name: string };

export type Attachment =
  | ReadyPicture
  | { kind: typeof ATTACHMENT.missing; path: string }
  | { kind: typeof ATTACHMENT.empty; path: string }
  | { kind: typeof ATTACHMENT.tooBig; path: string; megabytes: number }
  | { kind: typeof ATTACHMENT.unsupported; path: string; name: string }
  | { kind: typeof ATTACHMENT.noChannel; path: string }
  | { kind: typeof ATTACHMENT.refused; path: string; why: string };

export type PictureFacts = {
  path: string;
  bytes: number | null;
  channelCarriesPictures: boolean;
};

export const nameIn = (path: string): string => {
  const segments = path.split(PATH_SEPARATOR).filter((segment) => segment !== "");

  return segments[segments.length - THE_LAST_ONE] ?? path;
};

const suffixOf = (name: string): string => {
  const dot = name.lastIndexOf(SUFFIX_SEPARATOR);

  return dot <= AT_THE_START ? NO_SUFFIX : name.slice(dot + AFTER_THE_DOT).toLowerCase();
};

export const attachmentFor = (facts: PictureFacts): Attachment => {
  const name = nameIn(facts.path);

  if (!facts.channelCarriesPictures) {
    return { kind: ATTACHMENT.noChannel, path: facts.path };
  }

  if (facts.bytes === null) {
    return { kind: ATTACHMENT.missing, path: facts.path };
  }

  if (facts.bytes <= NOTHING_IN_IT) {
    return { kind: ATTACHMENT.empty, path: facts.path };
  }

  if (!PICTURE_SUFFIXES.includes(suffixOf(name))) {
    return { kind: ATTACHMENT.unsupported, path: facts.path, name };
  }

  if (facts.bytes > TELEGRAM_FILE_LIMIT_BYTES) {
    return {
      kind: ATTACHMENT.tooBig,
      path: facts.path,
      megabytes: Math.round(facts.bytes / BYTES_PER_MEGABYTE),
    };
  }

  return { kind: ATTACHMENT.ready, path: facts.path, name };
};

export const wasAttached = (attachment: Attachment | null): attachment is ReadyPicture =>
  attachment !== null && attachment.kind === ATTACHMENT.ready;

export const refusedPicture = (picture: ReadyPicture, why: string): Attachment => ({
  kind: ATTACHMENT.refused,
  path: picture.path,
  why,
});

export const WORDS_ARRIVED_WITHOUT_IT =
  "Telegram took the words but refused the picture. Do not send the words again — they are already on the phone";

export const RATE_LIMIT_TOOK_IT = "the rate limit swallowed the ping it was riding on";

export const captionFits = (text: string): boolean => text.length <= TELEGRAM_CAPTION_LIMIT;

export const attachmentReport = (attachment: Attachment | null): string => {
  if (attachment === null) {
    return "";
  }

  switch (attachment.kind) {
    case ATTACHMENT.ready:
      return "";

    case ATTACHMENT.missing:
      return `The picture did not go: there is nothing at ${attachment.path}.`;

    case ATTACHMENT.empty:
      return `The picture did not go: ${attachment.path} is an empty file.`;

    case ATTACHMENT.tooBig:
      return `The picture did not go: ${attachment.path} is ${attachment.megabytes} MB, and Telegram takes ${TELEGRAM_FILE_LIMIT_BYTES / BYTES_PER_MEGABYTE} MB at most.`;

    case ATTACHMENT.unsupported:
      return `The picture did not go: ${attachment.name} is none of ${PICTURE_SUFFIXES.join(", ")}. Render it to one of those and call again.`;

    case ATTACHMENT.noChannel:
      return "The picture did not go: this machine forwards its pings through a relay, which carries text only.";

    case ATTACHMENT.refused:
      return `The picture did not go: ${attachment.why}.`;

    default:
      return impossible(attachment);
  }
};
