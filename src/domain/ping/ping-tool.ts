import { attachmentReport, type Attachment } from "#domain/ping/attachment.ts";
import { copy } from "#domain/copy.ru.ts";
import { impossible } from "#domain/impossible.ts";


export const MCP_SERVER_NAME = "claude-notify";

export const PING_TOOL = "ping_user";

const NOTHING_WENT_WRONG = 0;

export const PING_OUTCOME = {
  sent: "sent",
  queued: "queued",
  skipped: "skipped",
  failed: "failed",
  unconfigured: "unconfigured",
} as const;

export type PingOutcome =
  | { kind: typeof PING_OUTCOME.sent }
  | { kind: typeof PING_OUTCOME.queued; idleSeconds: number }
  | { kind: typeof PING_OUTCOME.skipped; sinceLastSentMinutes: number }
  | { kind: typeof PING_OUTCOME.failed; why: string }
  | { kind: typeof PING_OUTCOME.unconfigured };

export const PING_TOOL_TITLE = "Ping the user on Telegram";

export const PING_TOOL_DESCRIPTION = `Reach the user on their phone when you need them and they may have walked away from the machine.

Call this whenever you are about to stop and wait for them: you asked a question, a phase is finished and waits for approval, a permission or a decision blocks you, or you hit a fork mid-task that only they can settle. It is worth calling in the middle of long autonomous work too, not only at the end of a turn — the whole point is that an agent blocked at 14:00 should not be discovered at 17:00.

Do NOT try to judge whether they are at the keyboard. You cannot see that, and guessing wrong costs them hours of an idle agent. Always just call this: it measures their idle time itself, holds the ping in a queue while they are still at the machine, and delivers it the moment they step away.

Do NOT call it for progress reports or for turn endings where nothing is needed from them.

An optional \`image\` takes an absolute path to a picture on this machine — png, jpg, jpeg, gif or webp — and sends it along, so they can look at it on the phone rather than walk to the screen. Attach only something you have just produced yourself and want judged: a mockup, a rendered chart, a screenshot of what you built. Never attach a file merely because it is lying around, and never attach one you have not looked at. A ping carrying a picture goes out immediately rather than waiting for them to step away, since the point of it is the picture and not the summons.

Write one short line in Russian saying what is needed. The [project] prefix, the machine name and the account's limit windows are added for you — never write them yourself. Example: ${copy.toolPingExample}`;

export const outcomeReport = (outcome: PingOutcome): string => {
  switch (outcome.kind) {
    case PING_OUTCOME.sent:
      return "Delivered to their phone.";

    case PING_OUTCOME.queued:
      return `They are still at the keyboard (idle ${outcome.idleSeconds}s), so nothing was sent yet: the ping is queued and goes out the moment they step away. Carry on rather than waiting for them.`;

    case PING_OUTCOME.skipped:
      return `Not sent: this project already pinged ${Math.floor(outcome.sinceLastSentMinutes)} minute(s) ago and the rate limit swallowed this one.`;

    case PING_OUTCOME.failed:
      return `Could not reach Telegram: ${outcome.why}. The ping is lost, though the mechanical hook may still reach them when the turn ends.`;

    case PING_OUTCOME.unconfigured:
      return "claude-notify is not configured on this machine, so nothing was sent.";

    default:
      return impossible(outcome);
  }
};

export const nothingWasSent = (outcome: PingOutcome): boolean => {
  switch (outcome.kind) {
    case PING_OUTCOME.failed:
    case PING_OUTCOME.unconfigured:
      return true;

    case PING_OUTCOME.sent:
    case PING_OUTCOME.queued:
    case PING_OUTCOME.skipped:
      return false;

    default:
      return impossible(outcome);
  }
};

export type Session = { id: string | undefined; projectDirectory: string | undefined };

export const notifyArgv = (
  entryPoint: string,
  message: string,
  session: Session,
  imagePath?: string
): string[] => {
  const argv = [entryPoint, "--message", message];

  if (session.id !== undefined && session.id !== "") {
    argv.push("--session", session.id);
  }

  if (session.projectDirectory !== undefined && session.projectDirectory !== "") {
    argv.push("--project", session.projectDirectory);
  }

  if (imagePath !== undefined && imagePath !== "") {
    argv.push("--image", imagePath);
  }

  return argv;
};

export const pingReport = (outcome: PingOutcome, picture: Attachment | null): string =>
  [outcomeReport(outcome), attachmentReport(picture)].filter((line) => line !== "").join("\n");

export type ToolAnswer = { said: string; failed: boolean };

export const toolAnswer = (said: string, complained: string, exitCode: number | null): ToolAnswer => {
  const spoke = said.trim() === "" ? complained.trim() : said.trim();

  return {
    said: spoke === "" ? "the notifier said nothing at all, so it is unknown whether this arrived" : spoke,
    failed: exitCode !== NOTHING_WENT_WRONG,
  };
};
