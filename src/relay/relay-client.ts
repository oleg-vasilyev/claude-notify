import {
  authorizationFor,
  HEALTH_PATH,
  PING_PATH,
  relayEndpoint,
} from "#domain/relay-protocol.ts";


const RELAY_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 3_000;

export const relayMessage = async (
  url: string,
  secret: string,
  text: string
): Promise<void> => {
  const response = await fetch(relayEndpoint(url, PING_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: authorizationFor(secret),
    },
    body: JSON.stringify({ message: text }),
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`the relay refused with ${response.status}: ${await response.text()}`);
  }
};

export const relayAnswers = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(relayEndpoint(url, HEALTH_PATH), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    await response.arrayBuffer();

    return response.ok;
  } catch {
    return false;
  }
};
