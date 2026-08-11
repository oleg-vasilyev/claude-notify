import { MCP_SERVER_NAME, PING_TOOL } from "#domain/ping/ping-tool.ts";


export const PING_TOOL_PERMISSION = `mcp__${MCP_SERVER_NAME}__${PING_TOOL}`;

export type PermittedSettings = {
  permissions?: { allow?: string[] } & Record<string, unknown>;
} & Record<string, unknown>;

export const withToolAllowed = <T extends PermittedSettings>(settings: T, tool: string): T => {
  const allowed = settings.permissions?.allow ?? [];

  if (allowed.includes(tool)) {
    return settings;
  }

  return {
    ...settings,
    permissions: { ...settings.permissions, allow: [...allowed, tool] },
  };
};
