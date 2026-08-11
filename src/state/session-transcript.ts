import { openSync, readSync, statSync, closeSync } from "node:fs";


const TAIL_BYTES = 512 * 1024;
const FROM_THE_START = 0;

const tailOf = (path: string): string => {
  const file = openSync(path, "r");

  try {
    const size = statSync(path).size;
    const from = size > TAIL_BYTES ? size - TAIL_BYTES : FROM_THE_START;
    const buffer = Buffer.alloc(size - from);

    readSync(file, buffer, FROM_THE_START, buffer.length, from);

    return buffer.toString("utf8");
  } finally {
    closeSync(file);
  }
};

export const toolHasAnswered = (transcriptPath: string, toolUseId: string): boolean => {
  try {
    return tailOf(transcriptPath).includes(`"tool_use_id":"${toolUseId}"`);
  } catch {
    return false;
  }
};
