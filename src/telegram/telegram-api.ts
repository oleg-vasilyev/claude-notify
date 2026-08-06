const SEND_TIMEOUT_MS = 10_000;

export const sendMessage = async (
  token: string,
  chatId: string,
  text: string
): Promise<void> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Telegram refused with ${response.status}: ${await response.text()}`);
  }
};

export const resolveChatId = async (token: string): Promise<string | null> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
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
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`the token was refused with ${response.status}`);
  }

  const me = (await response.json()) as { result?: { username?: string } };

  return me.result?.username ?? "";
};
