import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";


const projectRoot = resolve(import.meta.dirname, "..");
const ENTRY = resolve(projectRoot, "src", "mcp.ts");
const PROTOCOL = "2025-06-18";
const FIRST_CALL = 1;

export interface ToolAnswer {
  readonly said: string;
  readonly failed: boolean;
}

export interface ToolDescription {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly required: string[];
}

export interface PingToolWorld {
  readonly home: string;
  readonly envFile: string;
  readonly apiRoot: string;
  readonly workingIn: string;
}

export interface PingToolServer {
  listTools(): Promise<ToolDescription>;
  ping(message: string): Promise<ToolAnswer>;
  callByName(tool: string, args: Record<string, unknown>): Promise<ToolAnswer>;
  stop(): Promise<void>;
}

type Answer = { id?: number; result?: Record<string, unknown>; error?: { message?: string } };

const answered = (
  child: ChildProcessWithoutNullStreams,
  waiting: Map<number, (answer: Answer) => void>
): void => {
  let buffered = "";

  child.stdout.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");

    for (;;) {
      const breakAt = buffered.indexOf("\n");

      if (breakAt < 0) {
        return;
      }

      const line = buffered.slice(0, breakAt).trim();

      buffered = buffered.slice(breakAt + 1);

      if (line === "") {
        continue;
      }

      const answer = JSON.parse(line) as Answer;
      const settle = answer.id === undefined ? undefined : waiting.get(answer.id);

      if (settle !== undefined) {
        waiting.delete(answer.id as number);
        settle(answer);
      }
    }
  });
};

export const startPingTool = async (world: PingToolWorld): Promise<PingToolServer> => {
  const child = spawn(process.execPath, [ENTRY], {
    cwd: world.workingIn,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      CLAUDE_NOTIFY_HOME: world.home,
      CLAUDE_NOTIFY_ENV: world.envFile,
      BOT_API_ROOT: world.apiRoot,
    },
  });

  const waiting = new Map<number, (answer: Answer) => void>();
  const abandoned = new Map<number, (failure: Error) => void>();
  let nextId = FIRST_CALL;
  let complaints = "";

  answered(child, waiting);

  child.stderr.on("data", (chunk: Buffer) => {
    complaints += chunk.toString("utf8");
  });

  child.on("close", () => {
    for (const give of abandoned.values()) {
      give(new Error(`the ping tool died before answering: ${complaints}`));
    }

    abandoned.clear();
  });

  const request = (method: string, params?: Record<string, unknown>): Promise<Answer> => {
    const id = nextId++;

    return new Promise<Answer>((settle, give) => {
      waiting.set(id, (answer) => {
        abandoned.delete(id);
        settle(answer);
      });
      abandoned.set(id, give);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  const tell = (method: string): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  };

  await request("initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "an-e2e-client", version: "1" },
  });

  tell("notifications/initialized");

  const asToolAnswer = (answer: Answer): ToolAnswer => {
    const content = answer.result?.content as { text?: string }[] | undefined;

    return {
      said: content?.[0]?.text ?? answer.error?.message ?? "",
      failed: answer.result?.isError === true || answer.error !== undefined,
    };
  };

  return {
    listTools: async () => {
      const answer = await request("tools/list");
      const tools = answer.result?.tools as
        | { name: string; title: string; description: string; inputSchema: { required: string[] } }[]
        | undefined;
      const only = tools?.[0];

      return {
        name: only?.name ?? "",
        title: only?.title ?? "",
        description: only?.description ?? "",
        required: only?.inputSchema.required ?? [],
      };
    },

    ping: async (message: string) =>
      asToolAnswer(await request("tools/call", { name: "ping_user", arguments: { message } })),

    callByName: async (tool: string, args: Record<string, unknown>) =>
      asToolAnswer(await request("tools/call", { name: tool, arguments: args })),

    stop: () =>
      new Promise<void>((settle) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          settle();

          return;
        }

        child.on("close", () => settle());
        child.kill();
      }),
  };
};
