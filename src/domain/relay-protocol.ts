const BEARER = "Bearer ";
const TRAILING_SLASHES = /\/+$/;

export const PING_PATH = "/ping";
export const HEALTH_PATH = "/health";

export const RELAY_REQUEST = {
  ping: "ping",
  unauthorised: "unauthorised",
  malformed: "malformed",
} as const;

export type RelayRequest =
  | { kind: typeof RELAY_REQUEST.ping; message: string }
  | { kind: typeof RELAY_REQUEST.unauthorised }
  | { kind: typeof RELAY_REQUEST.malformed };

export const relayEndpoint = (base: string, path: string): string =>
  `${base.replace(TRAILING_SLASHES, "")}${path}`;

export const authorizationFor = (secret: string): string => `${BEARER}${secret}`;

const parsedBody = (body: string): { message?: unknown } | null => {
  try {
    return JSON.parse(body) as { message?: unknown } | null;
  } catch {
    return null;
  }
};

const messageIn = (body: string): string | null => {
  const message = parsedBody(body)?.message;

  return typeof message === "string" && message.trim() !== "" ? message : null;
};

export const relayRequestFrom = (
  secret: string,
  authorization: string | undefined,
  body: string
): RelayRequest => {
  if (secret === "" || authorization !== authorizationFor(secret)) {
    return { kind: RELAY_REQUEST.unauthorised };
  }

  const message = messageIn(body);

  return message === null ? { kind: RELAY_REQUEST.malformed } : { kind: RELAY_REQUEST.ping, message };
};
