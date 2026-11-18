import { copy } from "#domain/copy.ru.ts";
import { bracketPrefixOf } from "#domain/project.ts";


const TITLE_RECORD = '"type":"custom-title"';

export const withChatTitle = (message: string, title: string | null): string => {
  if (title === null) {
    return message;
  }

  const prefix = bracketPrefixOf(message);
  const gap = prefix === "" || prefix.endsWith(" ") ? "" : " ";

  return `${prefix}${gap}${copy.chatTitle(title)} ${message.slice(prefix.length)}`;
};

const titleOn = (line: string): string | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const title = (parsed as { customTitle?: unknown }).customTitle;

  return typeof title === "string" && title.trim() !== "" ? title.trim() : null;
};

export const chatTitleIn = (transcriptTail: string): string | null => {
  const records = transcriptTail.split("\n").filter((line) => line.includes(TITLE_RECORD));

  for (const line of records.reverse()) {
    const title = titleOn(line);

    if (title !== null) {
      return title;
    }
  }

  return null;
};
