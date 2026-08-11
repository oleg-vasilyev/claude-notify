import { parseArgs } from "node:util";

import { nothingWasSent, outcomeReport } from "#domain/ping/ping-tool.ts";
import { projectPrefixOf, underProject } from "#domain/project.ts";
import { numberOr } from "#domain/written-number.ts";
import { deliver } from "#app/deliver.ts";


const NEVER_RATE_LIMITED = 0;
const NOTHING_WAS_SENT = 1;

const { values } = parseArgs({
  options: {
    message: { type: "string", short: "m" },
    project: { type: "string" },
    "rate-limit-minutes": { type: "string", default: "0" },
    now: { type: "boolean", default: false },
  },
});

const said = values.message ?? "";

if (said === "") {
  throw new Error(
    'claude-notify: a ping needs a message, e.g. --message "waiting for your approval"'
  );
}

const outcome = await deliver({
  message: underProject(said, projectPrefixOf(values.project ?? process.cwd())),
  rateLimitMinutes: numberOr(values["rate-limit-minutes"], NEVER_RATE_LIMITED),
  ignorePresence: values.now,
});

console.log(outcomeReport(outcome));

if (nothingWasSent(outcome)) {
  process.exitCode = NOTHING_WAS_SENT;
}
