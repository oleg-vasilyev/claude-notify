import { createServer, type Server, type ServerResponse } from "node:http";

import { impossible } from "#domain/impossible.ts";
import {
  HEALTH_PATH,
  PING_PATH,
  RELAY_REQUEST,
  relayRequestFrom,
} from "#domain/relay-protocol.ts";
import { log } from "#state/log.ts";
import { sendMessage } from "#telegram/telegram-api.ts";


const ACCEPTED = 200;
const MALFORMED = 400;
const UNAUTHORISED = 401;
const NOT_FOUND = 404;
const TELEGRAM_REFUSED = 502;
const EVERY_INTERFACE = "0.0.0.0";
const NO_PORT = 0;
const QUERY = "?";
const UNKNOWN_CALLER = "an unknown address";

export type RelayHost = {
  port: number;
  secret: string;
  token: string;
  chatId: string;
};

const bodyOf = async (stream: AsyncIterable<Buffer>): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const answer = (response: ServerResponse, status: number): void => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: status === ACCEPTED }));
};

const forward = async (host: RelayHost, message: string, html: boolean): Promise<number> => {
  try {
    await sendMessage(host.token, host.chatId, message, html);
    log(`RELAY sent | ${message.replaceAll("\n", " | ")}`);

    return ACCEPTED;
  } catch (failure) {
    log(`ERROR relay send failed: ${String(failure)} | ${message}`);

    return TELEGRAM_REFUSED;
  }
};

export const startRelay = async (host: RelayHost): Promise<Server> => {
  const server = createServer((request, response) => {
    void (async () => {
      const path = (request.url ?? "").split(QUERY)[0] ?? "";
      const body = await bodyOf(request);

      if (path === HEALTH_PATH) {
        answer(response, ACCEPTED);

        return;
      }

      if (path !== PING_PATH) {
        answer(response, NOT_FOUND);

        return;
      }

      const asked = relayRequestFrom(host.secret, request.headers.authorization, body);

      switch (asked.kind) {
        case RELAY_REQUEST.unauthorised:
          log(`RELAY refused, wrong secret from ${request.socket.remoteAddress ?? UNKNOWN_CALLER}`);
          answer(response, UNAUTHORISED);

          return;

        case RELAY_REQUEST.malformed:
          log("RELAY refused, the request carried no message");
          answer(response, MALFORMED);

          return;

        case RELAY_REQUEST.ping:
          answer(response, await forward(host, asked.message, asked.html));

          return;

        default:
          return impossible(asked);
      }
    })();
  });

  await new Promise<void>((listening) => {
    server.listen(host.port, EVERY_INTERFACE, listening);
  });

  return server;
};

export const boundPort = (server: Server): number => {
  const address = server.address();

  return typeof address === "object" && address !== null ? address.port : NO_PORT;
};
