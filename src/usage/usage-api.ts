import { readFileSync } from "node:fs";

import { humanizeDuration } from "#domain/duration.ts";
import { USAGE, type UsageRead, type UsageSnapshot } from "#domain/ping/usage.ts";
import { credentialsFile } from "#state/file-locations.ts";


const USAGE_TIMEOUT_MS = 6000;
const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const ALREADY_GONE = 0;

type StoredCredential = { accessToken?: string; expiresAt?: number };
type CredentialFile = Record<string, StoredCredential | undefined>;

const stored = (): StoredCredential | null => {
  let file: CredentialFile;

  try {
    file = JSON.parse(readFileSync(credentialsFile(), "utf8")) as CredentialFile;
  } catch {
    return null;
  }

  for (const entry of Object.values(file)) {
    if (entry?.accessToken !== undefined) {
      return entry;
    }
  }

  return null;
};

export const fetchUsage = async (): Promise<UsageRead> => {
  const credential = stored();

  if (credential?.accessToken === undefined) {
    return { kind: USAGE.unavailable, why: "no OAuth token in the credentials file" };
  }

  const expiredFor =
    credential.expiresAt === undefined ? ALREADY_GONE : Date.now() - credential.expiresAt;

  if (expiredFor > ALREADY_GONE) {
    return {
      kind: USAGE.unavailable,
      why: `the stored token expired ${humanizeDuration(expiredFor)} ago and only Claude Code may replace it`,
    };
  }

  try {
    const response = await fetch(USAGE_ENDPOINT, {
      headers: { Authorization: `Bearer ${credential.accessToken}` },
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { kind: USAGE.unavailable, why: `the endpoint answered ${response.status}` };
    }

    return { kind: USAGE.read, snapshot: (await response.json()) as UsageSnapshot };
  } catch (failure) {
    return {
      kind: USAGE.unavailable,
      why: `${(failure as Error).name}: ${(failure as Error).message}`,
    };
  }
};
