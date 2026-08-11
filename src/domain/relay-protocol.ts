const BEARER = "Bearer ";
const TRAILING_SLASHES = /\/+$/;

export const PING_PATH = "/ping";
export const HEALTH_PATH = "/health";

export type RelayRequest =
  | { kind: "ping"; message: string }
  | { kind: "unauthorised" }
  | { kind: "malformed" };

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
    return { kind: "unauthorised" };
  }

  const message = messageIn(body);

  return message === null ? { kind: "malformed" } : { kind: "ping", message };
};
