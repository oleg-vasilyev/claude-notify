import { isHookEvent, pingFor, type HookPayload } from "#domain/hook-ping.ts";
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
const answered = await ask(event, payload);

if (answered !== null) {
  if (Object.keys(answered).length > NOTHING_TO_SAY) {
    process.stdout.write(JSON.stringify(answered));
  }

  process.exit(0);
}

await deliver(pingFor(event, payload));
