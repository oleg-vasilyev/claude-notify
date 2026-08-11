export type AskedFor = {
  relayUrl?: string | undefined;
  token?: string | undefined;
  secret?: string | undefined;
};

export type Inherited = {
  sendsThroughARelay: boolean;
  secret: string;
};

export const SECRET_CHOICE = {
  use: "use",
  ask: "ask",
  generate: "generate",
  none: "none",
} as const;

export type SecretChoice =
  | { kind: typeof SECRET_CHOICE.use; secret: string }
  | { kind: typeof SECRET_CHOICE.ask }
  | { kind: typeof SECRET_CHOICE.generate }
  | { kind: typeof SECRET_CHOICE.none };

export const relayWanted = (asked: AskedFor, inherited: Inherited): boolean =>
  asked.relayUrl !== undefined || (asked.token === undefined && inherited.sendsThroughARelay);

export const secretChoice = (
  asked: AskedFor,
  inherited: Inherited,
  sendingThroughARelay: boolean,
  hostingARelay: boolean
): SecretChoice => {
  if (asked.secret !== undefined) {
    return { kind: SECRET_CHOICE.use, secret: asked.secret };
  }

  if (inherited.secret !== "") {
    return { kind: SECRET_CHOICE.use, secret: inherited.secret };
  }

  if (sendingThroughARelay) {
    return { kind: SECRET_CHOICE.ask };
  }

  return hostingARelay ? { kind: SECRET_CHOICE.generate } : { kind: SECRET_CHOICE.none };
};
