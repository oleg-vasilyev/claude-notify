import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { isSessionActivity, type SessionNote } from "#domain/ping/session-activity.ts";
import { sessionNoteFile, stateHome } from "#state/file-locations.ts";


export const writeSessionNote = (sessionId: string, note: SessionNote): void => {
  mkdirSync(stateHome(), { recursive: true });
  writeFileSync(sessionNoteFile(sessionId), JSON.stringify(note), "utf8");
};

export const readSessionNote = (sessionId: string): SessionNote | null => {
  if (!existsSync(sessionNoteFile(sessionId))) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(sessionNoteFile(sessionId), "utf8")) as Partial<SessionNote>;

    return isSessionActivity(parsed.activity) ? (parsed as SessionNote) : null;
  } catch {
    return null;
  }
};
