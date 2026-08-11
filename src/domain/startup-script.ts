const WINDOWS_NEWLINE = "\r\n";

export const RELAY_WINDOW_TITLE = "claude-notify relay";

export const startupScript = (node: string, entry: string): string =>
  [
    "@echo off",
    `start "${RELAY_WINDOW_TITLE}" /min "${node}" "${entry}"`,
    "",
  ].join(WINDOWS_NEWLINE);
