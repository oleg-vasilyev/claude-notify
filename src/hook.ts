import { isHookEvent, type HookPayload } from "#domain/hook-event.ts";
import { pingFor, stillWorking, transcriptToWatch } from "#domain/ping/hook-ping.ts";
import { readConfig } from "#state/config.ts";
import { flattenPayload, log } from "#state/log.ts";
import { ask } from "#app/ask.ts";
import { deliver } from "#app/deliver.ts";


const NOTHING_TO_SAY = 0;

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const parsed = (raw: string): HookPayload => {
  try {
    return JSON.parse(raw) as HookPayload;
  } catch {
    return {};
  }
};

const event = process.argv[2] ?? "";

if (!isHookEvent(event)) {
  log(`WARN hook called with an unknown event: ${event}`);
  process.exit(0);
}

const raw = await readStdin();

log(`HOOK ${event} | ${flattenPayload(raw)}`);

const payload = parsed(raw);

if (stillWorking(event, payload)) {
  log(`SKIP the turn ended but background work is still running | ${event}`);
} else {
  const answered = await ask(event, payload);

  if (answered === null) {
    await deliver({
      ...pingFor(event, payload, readConfig()?.quoteQuestions === true),
      transcriptPath: transcriptToWatch(event, payload),
    });
  } else if (Object.keys(answered).length > NOTHING_TO_SAY) {
    process.stdout.write(JSON.stringify(answered));
  }
}
