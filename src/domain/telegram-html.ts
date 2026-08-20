const AMPERSAND = "&";
const LESS_THAN = "<";
const GREATER_THAN = ">";

export const escaped = (text: string): string =>
  text
    .split(AMPERSAND)
    .join("&amp;")
    .split(LESS_THAN)
    .join("&lt;")
    .split(GREATER_THAN)
    .join("&gt;");

export const messageWith = (text: string, block: string): string =>
  block === ""
    ? escaped(text)
    : `${escaped(text)}\n\n<blockquote><code>${escaped(block)}</code></blockquote>`;
