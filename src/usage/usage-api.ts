import { readFileSync } from "node:fs";

import { USAGE, type UsageRead, type UsageSnapshot } from "#domain/ping/usage.ts";
import { credentialsFile } from "#state/file-locations.ts";


const USAGE_TIMEOUT_MS = 6000;
const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";

type CredentialFile = Record<string, { accessToken?: string } | undefined>;

const accessToken = (): string | null => {
  let stored: CredentialFile;

  try {
    stored = JSON.parse(readFileSync(credentialsFile(), "utf8")) as CredentialFile;
  } catch {
    return null;
  }

  for (const entry of Object.values(stored)) {
    if (entry?.accessToken !== undefined) {
      return entry.accessToken;
    }
  }

  return null;
};

export const fetchUsage = async (): Promise<UsageRead> => {
  const token = accessToken();

  if (token === null) {
    return { kind: USAGE.unavailable, why: "no OAuth token in the credentials file" };
  }

  try {
    const response = await fetch(USAGE_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { kind: USAGE.unavailable, why: `the endpoint answered ${response.status}` };
    }

    return { kind: USAGE.read, snapshot: (await response.json()) as UsageSnapshot };
  } catch (failure) {
    return { kind: USAGE.unavailable, why: `${(failure as Error).name}: ${(failure as Error).message}` };
  }
};
