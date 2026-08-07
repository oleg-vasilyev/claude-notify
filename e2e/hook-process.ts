import { spawn } from "node:child_process";
import { resolve } from "node:path";


const projectRoot = resolve(import.meta.dirname, "..");
const ENTRY = resolve(projectRoot, "src", "hook.ts");
const OWNED_MARKER = "claude-notify";

export interface HookRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

export interface HookWorld {
  readonly home: string;
  readonly envFile: string;
  readonly apiRoot: string;
}

export const runHook = (
  event: string,
  payload: Record<string, unknown>,
  world: HookWorld
): Promise<HookRun> => {
  const child = spawn(process.execPath, [ENTRY, event, OWNED_MARKER], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      CLAUDE_NOTIFY_HOME: world.home,
      CLAUDE_NOTIFY_ENV: world.envFile,
      BOT_API_ROOT: world.apiRoot,
    },
  });

  const out: Buffer[] = [];
  const err: Buffer[] = [];

  child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => err.push(chunk));

  child.stdin.write(Buffer.from(JSON.stringify(payload), "utf8"));
  child.stdin.end();

  return new Promise<HookRun>((settle) => {
    child.on("close", (code) => {
      settle({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        code,
      });
    });
  });
};
