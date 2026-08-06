const BLANK_OR_COMMENT = /^\s*(#|$)/;
const QUOTED = /^(["'])(.*)\1$/s;
const INSIDE_THE_QUOTES = 2;

export const withEnvValues = (text: string, values: Record<string, string>): string => {
  const written = new Set<string>();

  const updated = text.split("\n").map((line) => {
    const separator = line.indexOf("=");

    if (BLANK_OR_COMMENT.test(line) || separator < 0) {
      return line;
    }

    const key = line.slice(0, separator).trim();
    const value = values[key];

    if (value === undefined) {
      return line;
    }

    written.add(key);

    return `${key}=${value}`;
  });

  const missing = Object.entries(values)
    .filter(([key]) => !written.has(key))
    .map(([key, value]) => `${key}=${value}`);

  if (missing.length === 0) {
    return updated.join("\n");
  }

  const kept = updated.join("\n").trimEnd();
  const appended = `${missing.join("\n")}\n`;

  return kept === "" ? appended : `${kept}\n${appended}`;
};

export const parseEnvFile = (text: string): Record<string, string> => {
  const values: Record<string, string> = {};

  for (const line of text.split("\n")) {
    if (BLANK_OR_COMMENT.test(line)) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const written = line.slice(separator + 1).trim();
    const quoted = QUOTED.exec(written);

    if (key !== "") {
      values[key] = quoted?.[INSIDE_THE_QUOTES] ?? written;
    }
  }

  return values;
};
