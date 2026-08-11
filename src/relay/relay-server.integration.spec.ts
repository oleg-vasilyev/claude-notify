import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "#state/log.ts";
import { sendMessage } from "#telegram/telegram-api.ts";
import { boundPort, startRelay } from "#relay/relay-server.ts";


vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#telegram/telegram-api.ts", () => ({ sendMessage: vi.fn() }));

const ANY_FREE_PORT = 0;
const SECRET = "s3cr3t";
const ACCEPTED = 200;
const MALFORMED = 400;
const UNAUTHORISED = 401;
const NOT_FOUND = 404;
const TELEGRAM_REFUSED = 502;
const A_PING = "[job-finder@work] закончил ход, ждёт тебя";

let server: Server;
let root: string;

const post = (path: string, secret: string | null, body: string): Promise<Response> =>
  fetch(`${root}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret === null ? {} : { Authorization: `Bearer ${secret}` }),
    },
    body,
  });

const ping = (secret: string | null, message: unknown): Promise<Response> =>
  post("/ping", secret, JSON.stringify({ message }));

describe("the relay server", () => {
  beforeEach(async () => {
    vi.mocked(sendMessage).mockResolvedValue(undefined);

    server = await startRelay({
      port: ANY_FREE_PORT,
      secret: SECRET,
      token: "T",
      chatId: "42",
    });

    root = `http://127.0.0.1:${boundPort(server)}`;
  });

  afterEach(async () => {
    server.closeAllConnections();

    await new Promise<void>((closed) => {
      server.close(() => closed());
    });
  });

  it("forwards a ping from a caller carrying the secret", async () => {
    const response = await ping(SECRET, A_PING);

    expect(response.status).toBe(ACCEPTED);
    expect(sendMessage).toHaveBeenCalledWith("T", "42", A_PING);
  });

  it("keeps Cyrillic intact across the wire", async () => {
    await ping(SECRET, A_PING);

    expect(vi.mocked(sendMessage).mock.calls[0]?.[2]).toBe(A_PING);
  });

  it("sends nothing on behalf of a caller with the wrong secret", async () => {
    const response = await ping("wrong", A_PING);

    expect(response.status).toBe(UNAUTHORISED);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends nothing for a caller with no secret at all", async () => {
    const response = await ping(null, A_PING);

    expect(response.status).toBe(UNAUTHORISED);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("refuses a body carrying no message", async () => {
    const response = await post("/ping", SECRET, JSON.stringify({ text: "hi" }));

    expect(response.status).toBe(MALFORMED);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("says Telegram refused rather than claiming the ping went out", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("429"));

    const response = await ping(SECRET, A_PING);

    expect(response.status).toBe(TELEGRAM_REFUSED);
  });

  it("logs a forwarded ping, so a relay host can be debugged from its own log", async () => {
    await ping(SECRET, A_PING);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("RELAY sent"));
  });

  it("logs a refusal, so a mistyped secret is visible on the host too", async () => {
    await ping("wrong", A_PING);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("RELAY refused"));
  });

  it("answers a health check without a secret, so the far machine can prove it is reachable", async () => {
    const response = await fetch(`${root}/health`);

    expect(response.status).toBe(ACCEPTED);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("forwards nothing for a health check", async () => {
    await fetch(`${root}/health`);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("knows nothing about any other path", async () => {
    const response = await post("/anything-else", SECRET, JSON.stringify({ message: A_PING }));

    expect(response.status).toBe(NOT_FOUND);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("answers a health check that arrived with a query string", async () => {
    const response = await fetch(`${root}/health?from=work`);

    expect(response.status).toBe(ACCEPTED);
  });
});
