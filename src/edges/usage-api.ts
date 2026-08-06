import { readFileSync } from "node:fs";

import type { UsageSnapshot } from "#domain/usage.ts";
import { credentialsFile } from "#edges/paths.ts";


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

export const fetchUsage = async (): Promise<UsageSnapshot | null> => {
  const token = accessToken();

  if (token === null) {
    return null;
  }

  try {
    const response = await fetch(USAGE_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as UsageSnapshot;
  } catch {
    return null;
  }
};
