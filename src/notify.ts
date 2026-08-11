import { parseArgs } from "node:util";

import { numberOr } from "#domain/written-number.ts";
import { deliver } from "#app/deliver.ts";


const NEVER_RATE_LIMITED = 0;

const { values } = parseArgs({
  options: {
    message: { type: "string", short: "m" },
    "rate-limit-minutes": { type: "string", default: "0" },
    now: { type: "boolean", default: false },
  },
});

const message = values.message ?? "";

if (message === "") {
  throw new Error(
    'claude-notify: a ping needs a message, e.g. --message "[proj] waiting for your approval"'
  );
}

await deliver({
  message,
  rateLimitMinutes: numberOr(values["rate-limit-minutes"], NEVER_RATE_LIMITED),
  ignorePresence: values.now,
});
