import { decideDelivery } from "#domain/delivery.ts";
import { projectKeyOf, withMachineLabel } from "#domain/project.ts";
import { usageLine } from "#domain/usage.ts";
import { readConfig } from "#edges/config.ts";
import { log } from "#edges/log.ts";
import { idleSeconds } from "#edges/presence.ts";
import { appendPending, readLastSentAt, writeLastSentAt } from "#edges/store.ts";
import { sendMessage } from "#edges/telegram.ts";
import { fetchUsage } from "#edges/usage-api.ts";
import { startWatcher, watcherIsRunning } from "#edges/watcher-process.ts";


export type PingRequest = {
  message: string;
  rateLimitMinutes: number;
  ignorePresence?: boolean;
};

const withUsage = async (message: string): Promise<string> => {
  const line = usageLine(await fetchUsage(), new Date());

  if (line === "") {
    log("WARN usage unavailable");

    return message;
  }

  return `${message}\n${line}`;
};

export const deliver = async (request: PingRequest): Promise<void> => {
  const config = readConfig();

  if (config === null) {
    return;
  }

  const message = withMachineLabel(request.message, config.machineLabel);
  const project = projectKeyOf(request.message);

  const verdict = decideDelivery({
    idleSeconds: request.ignorePresence === true ? Number.MAX_SAFE_INTEGER : idleSeconds(),
    minIdleMinutes: config.minIdleMinutes,
    rateLimitMinutes: request.rateLimitMinutes,
    lastSentAt: readLastSentAt(project),
    now: Date.now(),
  });

  switch (verdict.kind) {
    case "queue":
      appendPending({ queuedAt: Date.now(), message });
      log(`QUEUED idle=${verdict.idleSeconds}s | ${message}`);

      if (!watcherIsRunning()) {
        startWatcher();
      }

      return;

    case "skip":
      log(`SKIP rate-limit [${project}] | ${message}`);

      return;

    case "send":
      break;
  }

  const text = config.includeUsage ? await withUsage(message) : message;

  try {
    await sendMessage(config.token, config.chatId, text);
    writeLastSentAt(project, Date.now());
    log(`SENT | ${text.replace("\n", " | ")}`);
  } catch (failure) {
    log(`ERROR send failed: ${String(failure)} | ${message}`);
    process.exitCode = 1;
  }
};
