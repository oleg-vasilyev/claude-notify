import { spawn } from "node:child_process";
import { resolve } from "node:path";


const projectRoot = resolve(import.meta.dirname, "..");
const ENTRY = resolve(projectRoot, "src", "relay.ts");
const LISTENING = /relay listening on (\d+)/;

export interface RelayProcess {
  readonly url: string;
  stop(): Promise<void>;
}

export interface RelayWorld {
  readonly home: string;
  readonly envFile: string;
  readonly apiRoot: string;
}

export const startRelayProcess = (world: RelayWorld): Promise<RelayProcess> => {
  const child = spawn(process.execPath, [ENTRY], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CLAUDE_NOTIFY_HOME: world.home,
      CLAUDE_NOTIFY_ENV: world.envFile,
      BOT_API_ROOT: world.apiRoot,
    },
  });

  return new Promise<RelayProcess>((listening, refused) => {
    let said = "";
    let complained = "";

    child.stderr.on("data", (chunk: Buffer) => {
      complained += chunk.toString("utf8");
    });

    child.stdout.on("data", (chunk: Buffer) => {
      said += chunk.toString("utf8");

      const port = LISTENING.exec(said)?.[1];

      if (port === undefined) {
        return;
      }

      listening({
        url: `http://127.0.0.1:${port}`,

        stop: () =>
          new Promise<void>((stopped) => {
            child.on("close", () => stopped());
            child.kill();
          }),
      });
    });

    child.on("close", (code) => {
      refused(new Error(`the relay exited with ${code}: ${complained}`));
    });
  });
};
