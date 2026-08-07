import { createServer, type Server } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";


const ANY_FREE_PORT = 0;
const A_MOMENT_MS = 50;
const LONGEST_HOLD_MS = 500;
const FIRST_UPDATE_ID = 100;
const FIRST_MESSAGE_ID = 500;

export interface Call {
  readonly method: string;
  readonly body: Record<string, unknown>;
}

export interface FakeTelegram {
  readonly apiRoot: string;
  calls(): Call[];
  whenAsked(): Promise<void>;
  whenAcknowledged(): Promise<void>;
  sentText(): string;
  keyboard(): { text: string; callback_data: string }[];
  whenClosed(): Promise<void>;
  closedText(): string;
  stillCarriesAKeyboard(): boolean;
  press(data: string, chatId: number): void;
  write(text: string, chatId: number): void;
  answered(): boolean;
  stop(): Promise<void>;
}

const bodyOf = async (stream: AsyncIterable<Buffer>): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  if (raw === "") {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const startFakeTelegram = async (): Promise<FakeTelegram> => {
  const calls: Call[] = [];
  const waiting: Record<string, unknown>[] = [];
  let nextUpdateId = FIRST_UPDATE_ID;
  let nextMessageId = FIRST_MESSAGE_ID;

  const arrivals = new Map<string, (() => void)[]>();

  const announce = (method: string): void => {
    for (const wake of arrivals.get(method) ?? []) {
      wake();
    }

    arrivals.delete(method);
  };

  const when = (method: string): Promise<void> => {
    if (calls.some((call) => call.method === method)) {
      return Promise.resolve();
    }

    return new Promise<void>((wake) => {
      arrivals.set(method, [...(arrivals.get(method) ?? []), wake]);
    });
  };

  const server: Server = createServer((request, response) => {
    void (async () => {
      const method = (request.url ?? "").split("/").pop()?.split("?")[0] ?? "";
      const body = await bodyOf(request);

      calls.push({ method, body });
      announce(method);

      if (method === "getUpdates") {
        const held = Date.now() + LONGEST_HOLD_MS;

        while (waiting.length === 0 && Date.now() < held) {
          await sleep(A_MOMENT_MS);
        }

        const result = waiting.splice(0, waiting.length);

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, result }));

        return;
      }

      if (method === "sendMessage") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, result: { message_id: nextMessageId++ } }));

        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: {} }));
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(ANY_FREE_PORT, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : ANY_FREE_PORT;

  const sentMessages = (): Record<string, unknown>[] =>
    calls.filter((call) => call.method === "sendMessage").map((call) => call.body);

  return {
    apiRoot: `http://127.0.0.1:${port}`,

    calls: () => [...calls],

    whenAsked: () => when("sendMessage"),

    whenAcknowledged: () => when("answerCallbackQuery"),

    whenClosed: () => when("editMessageText"),

    closedText: () =>
      `${calls.find((call) => call.method === "editMessageText")?.body.text ?? ""}`,

    stillCarriesAKeyboard: () => {
      const edits = calls.filter((call) => call.method === "editMessageText");
      const last = edits[edits.length - 1];

      if (last === undefined) {
        return sentMessages().length > 0;
      }

      return last.body.reply_markup !== undefined;
    },

    sentText: () => `${sentMessages()[0]?.text ?? ""}`,

    keyboard: () => {
      const markup = sentMessages()[0]?.reply_markup as
        | { inline_keyboard?: { text: string; callback_data: string }[][] }
        | undefined;

      return (markup?.inline_keyboard ?? []).flat();
    },

    press: (data: string, chatId: number) => {
      waiting.push({
        update_id: nextUpdateId++,
        callback_query: { id: `cb${nextUpdateId}`, data, message: { chat: { id: chatId } } },
      });
    },

    write: (text: string, chatId: number) => {
      waiting.push({
        update_id: nextUpdateId++,
        message: { text, chat: { id: chatId } },
      });
    },

    answered: () => calls.some((call) => call.method === "answerCallbackQuery"),

    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};
