export type AskedFor = {
  relayUrl?: string | undefined;
  token?: string | undefined;
  secret?: string | undefined;
};

export type Inherited = {
  sendsThroughARelay: boolean;
  secret: string;
};

export type SecretChoice =
  | { kind: "use"; secret: string }
  | { kind: "ask" }
  | { kind: "generate" }
  | { kind: "none" };

export const relayWanted = (asked: AskedFor, inherited: Inherited): boolean =>
  asked.relayUrl !== undefined || (asked.token === undefined && inherited.sendsThroughARelay);

export const secretChoice = (
  asked: AskedFor,
  inherited: Inherited,
  sendingThroughARelay: boolean,
  hostingARelay: boolean
): SecretChoice => {
  if (asked.secret !== undefined) {
    return { kind: "use", secret: asked.secret };
  }

  if (inherited.secret !== "") {
    return { kind: "use", secret: inherited.secret };
  }

  if (sendingThroughARelay) {
    return { kind: "ask" };
  }

  return hostingARelay ? { kind: "generate" } : { kind: "none" };
};
