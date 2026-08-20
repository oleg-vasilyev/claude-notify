import { openAsBlob, statSync } from "node:fs";

import type { ReadyPicture } from "#domain/ping/attachment.ts";


const TELEGRAM = "https://api.telegram.org";
const HTML = "HTML";
const UPLOAD_TIMEOUT_MS = 60_000;

const apiRoot = (): string => process.env.BOT_API_ROOT ?? TELEGRAM;

export const pictureBytes = (path: string): number | null => {
  try {
    const found = statSync(path);

    return found.isFile() ? found.size : null;
  } catch {
    return null;
  }
};

export const sendPicture = async (
  token: string,
  chatId: string,
  picture: ReadyPicture,
  caption: string
): Promise<void> => {
  const form = new FormData();

  form.set("chat_id", chatId);
  form.set("document", await openAsBlob(picture.path), picture.name);

  if (caption !== "") {
    form.set("caption", caption);
    form.set("parse_mode", HTML);
  }

  const response = await fetch(`${apiRoot()}/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Telegram refused the picture with ${response.status}: ${await response.text()}`);
  }
};
