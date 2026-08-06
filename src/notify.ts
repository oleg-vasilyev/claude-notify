import { parseArgs } from "node:util";

import { deliver } from "#edges/deliver.ts";


const DECIMAL = 10;

const { values } = parseArgs({
  options: {
    message: { type: "string", short: "m" },
    "rate-limit-minutes": { type: "string", default: "0" },
    now: { type: "boolean", default: false },
  },
});

const message = values.message ?? "";

if (message === "") {
  throw new Error('claude-notify: a ping needs a message, e.g. --message "[proj] жду апрув"');
}

await deliver({
  message,
  rateLimitMinutes: Number.parseInt(values["rate-limit-minutes"], DECIMAL),
  ignorePresence: values.now,
});
