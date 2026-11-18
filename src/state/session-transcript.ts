import { openSync, readSync, statSync, closeSync } from "node:fs";

import { chatTitleIn } from "#domain/ping/chat-title.ts";


const ANSWER_TAIL_BYTES = 512 * 1024;
const TITLE_TAIL_BYTES = 2 * 1024 * 1024;
const FROM_THE_START = 0;

const tailOf = (path: string, bytes: number): string => {
  const file = openSync(path, "r");

  try {
    const size = statSync(path).size;
    const from = size > bytes ? size - bytes : FROM_THE_START;
    const buffer = Buffer.alloc(size - from);

    readSync(file, buffer, FROM_THE_START, buffer.length, from);

    return buffer.toString("utf8");
  } finally {
    closeSync(file);
  }
};

export const toolHasAnswered = (transcriptPath: string, toolUseId: string): boolean => {
  try {
    return tailOf(transcriptPath, ANSWER_TAIL_BYTES).includes(`"tool_use_id":"${toolUseId}"`);
  } catch {
    return false;
  }
};

export const readChatTitle = (transcriptPath: string): string | null => {
  try {
    return chatTitleIn(tailOf(transcriptPath, TITLE_TAIL_BYTES));
  } catch {
    return null;
  }
};
