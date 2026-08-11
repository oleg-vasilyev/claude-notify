import type { TelegramUpdate } from "#domain/asking/answer.ts";


const TELEGRAM = "https://api.telegram.org";
const SEND_TIMEOUT_MS = 10_000;
const POLL_MARGIN_MS = 5_000;
const MILLISECONDS_PER_SECOND = 1000;
const NEXT_UPDATE = 1;

const apiRoot = (): string => process.env.BOT_API_ROOT ?? TELEGRAM;

const drain = async (response: Response): Promise<void> => {
  try {
    await response.arrayBuffer();
  } catch {
    return;
  }
};

export const sendMessage = async (
  token: string,
  chatId: string,
  text: string
): Promise<void> => {
  const response = await fetch(`${apiRoot()}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Telegram refused with ${response.status}: ${await response.text()}`);
  }
};

export const sendQuestion = async (
  token: string,
  chatId: string,
  text: string,
  buttons: readonly { text: string; data: string }[]
): Promise<number | null> => {
  const response = await fetch(`${apiRoot()}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: buttons.map((button) => [
          { text: button.text, callback_data: button.data },
        ]),
      },
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Telegram refused with ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { result?: { message_id?: number } };

  return body.result?.message_id ?? null;
};

export const closeQuestion = async (
  token: string,
  chatId: string,
  messageId: number,
  text: string
): Promise<void> => {
  const response = await fetch(`${apiRoot()}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  await drain(response);
};

export const fetchUpdates = async (
  token: string,
  offset: number | null,
  waitSeconds: number
): Promise<TelegramUpdate[]> => {
  const query = new URLSearchParams({ timeout: `${waitSeconds}` });

  if (offset !== null) {
    query.set("offset", `${offset + NEXT_UPDATE}`);
  }

  const response = await fetch(
    `${apiRoot()}/bot${token}/getUpdates?${query.toString()}`,
    {
      signal: AbortSignal.timeout(waitSeconds * MILLISECONDS_PER_SECOND + POLL_MARGIN_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram refused with ${response.status}`);
  }

  const body = (await response.json()) as { result?: TelegramUpdate[] };

  return body.result ?? [];
};

export const answerCallback = async (token: string, callbackId: string): Promise<void> => {
  const response = await fetch(`${apiRoot()}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ callback_query_id: callbackId }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  await drain(response);
};

export const resolveChatId = async (token: string): Promise<string | null> => {
  const response = await fetch(`${apiRoot()}/bot${token}/getUpdates`, {
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const updates = (await response.json()) as {
    result?: { message?: { chat?: { id?: number } } }[];
  };

  for (const update of updates.result ?? []) {
    const id = update.message?.chat?.id;

    if (id !== undefined) {
      return `${id}`;
    }
  }

  return null;
};

export const botName = async (token: string): Promise<string> => {
  const response = await fetch(`${apiRoot()}/bot${token}/getMe`, {
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`the token was refused with ${response.status}`);
  }

  const me = (await response.json()) as { result?: { username?: string } };

  return me.result?.username ?? "";
};
