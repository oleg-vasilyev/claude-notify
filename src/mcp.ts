import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  MCP_SERVER_NAME,
  PING_TOOL,
  PING_TOOL_DESCRIPTION,
  PING_TOOL_TITLE,
  toolAnswer,
  type ToolAnswer,
} from "#domain/ping/ping-tool.ts";


const SERVER_VERSION = "2.0.0";
const COULD_NOT_RUN_IT = 1;

const notifyEntry = fileURLToPath(new URL("./notify.ts", import.meta.url));

const spokenBy = async (message: string): Promise<ToolAnswer> =>
  new Promise((settle) => {
    const notify = spawn(process.execPath, [notifyEntry, "--message", message], {
      cwd: process.cwd(),
      windowsHide: true,
    });

    let said = "";
    let complained = "";

    notify.stdout.on("data", (chunk: Buffer) => {
      said += chunk.toString("utf8");
    });

    notify.stderr.on("data", (chunk: Buffer) => {
      complained += chunk.toString("utf8");
    });

    notify.on("error", (failure) => {
      settle(toolAnswer("", `could not run the notifier: ${failure.message}`, COULD_NOT_RUN_IT));
    });

    notify.on("close", (code) => {
      settle(toolAnswer(said, complained, code));
    });
  });

const server = new McpServer({ name: MCP_SERVER_NAME, version: SERVER_VERSION });

server.registerTool(
  PING_TOOL,
  {
    title: PING_TOOL_TITLE,
    description: PING_TOOL_DESCRIPTION,
    inputSchema: {
      message: z
        .string()
        .describe("What is needed, in Russian, one short line under about 200 characters"),
    },
  },
  async ({ message }) => {
    const spoken = await spokenBy(message);

    return { content: [{ type: "text", text: spoken.said }], isError: spoken.failed };
  }
);

await server.connect(new StdioServerTransport());
