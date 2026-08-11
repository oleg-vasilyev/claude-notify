import { MCP_SERVER_NAME } from "#domain/ping/ping-tool.ts";


const HAS_A_SPACE = /\s/;

const quoted = (part: string): string => (HAS_A_SPACE.test(part) ? `"${part}"` : part);

const claudeCommand = (parts: string[]): string => ["claude", ...parts].map(quoted).join(" ");

export const forgetToolCommand = (): string =>
  claudeCommand(["mcp", "remove", "--scope", "user", MCP_SERVER_NAME]);

export const registerToolCommand = (runtime: string, entryPoint: string): string =>
  claudeCommand([
    "mcp",
    "add",
    "--scope",
    "user",
    MCP_SERVER_NAME,
    "--",
    runtime,
    entryPoint,
  ]);
