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

export interface Upload {
  readonly filename: string;
  readonly caption: string;
  readonly bytes: number;
}

export interface FakeTelegram {
  readonly apiRoot: string;
  calls(): Call[];
  whenAsked(): Promise<void>;
  whenPictureSent(): Promise<void>;
  sentPicture(): Upload | null;
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

const BYTE_FOR_BYTE = "latin1";
const HEADERS_END = "\r\n\r\n";
const AFTER_THE_HEADERS = HEADERS_END.length;
const TRAILING_BREAK = 2;
const NAMED = /name="([^"]*)"/;
const FILENAMED = /filename="([^"]*)"/;
const NOTHING = 0;

const readMultipart = (raw: Buffer, boundary: string): Record<string, unknown> => {
  const body: Record<string, unknown> = {};

  for (const part of raw.toString(BYTE_FOR_BYTE).split(`--${boundary}`)) {
    const breakAt = part.indexOf(HEADERS_END);

    if (breakAt < NOTHING) {
      continue;
    }

    const headers = part.slice(NOTHING, breakAt);
    const name = NAMED.exec(headers)?.[1];

    if (name === undefined) {
      continue;
    }

    const content = part.slice(breakAt + AFTER_THE_HEADERS, part.length - TRAILING_BREAK);
    const filename = FILENAMED.exec(headers)?.[1];

    body[name] =
      filename === undefined
        ? Buffer.from(content, BYTE_FOR_BYTE).toString("utf8")
        : { filename, bytes: content.length };
  }

  return body;
};

const bodyOf = async (
  stream: AsyncIterable<Buffer>,
  contentType: string
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks);
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];

  if (boundary !== undefined) {
    return readMultipart(raw, boundary);
  }

  const text = raw.toString("utf8");

  if (text === "") {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
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
      const body = await bodyOf(request, request.headers["content-type"] ?? "");

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

    whenPictureSent: () => when("sendDocument"),

    sentPicture: () => {
      const sent = calls.find((call) => call.method === "sendDocument");
      const document = sent?.body.document as { filename?: string; bytes?: number } | undefined;

      if (document === undefined) {
        return null;
      }

      return {
        filename: document.filename ?? "",
        caption: `${sent?.body.caption ?? ""}`,
        bytes: document.bytes ?? 0,
      };
    },

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
