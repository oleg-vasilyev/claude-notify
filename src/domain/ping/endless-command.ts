const REDIRECTION = /\d*>&\d+/g;
const SEGMENT_BREAK = /&&|\|\||[;|&\n]/;
const WHITESPACE = /\s+/;
const ARGUMENTS_FOLLOW = "--";
const NOT_FOUND = -1;
const ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_]\w*=/;

const PACKAGE_RUNNERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const SERVER_SCRIPTS = new Set(["start", "dev", "serve", "preview"]);
const DEV_SERVER_TOOLS = new Set(["wrangler", "vite", "next", "astro", "nuxt"]);
const DEV_SUBCOMMANDS = new Set(["dev", "start", "preview", "serve"]);
const SERVERS = new Set(["http-server", "live-server", "nodemon", "http.server"]);
const WATCH_FLAG = "--watch";
const FOLLOWER = "tail";
const FOLLOW_FLAG = /^(?:-[A-Za-z]*[fF][A-Za-z]*|--follow(?:=\S+)?)$/;

const segmentsOf = (command: string): string[][] =>
  command
    .replace(REDIRECTION, " ")
    .split(SEGMENT_BREAK)
    .map((segment) =>
      segment
        .trim()
        .split(WHITESPACE)
        .filter((token) => token !== "")
    );

const withoutEnvironment = (tokens: string[]): string[] => {
  const first = tokens.findIndex((token) => !ENVIRONMENT_ASSIGNMENT.test(token));

  return first === NOT_FOUND ? [] : tokens.slice(first);
};

const beforeArguments = (tokens: string[]): string[] => {
  const end = tokens.indexOf(ARGUMENTS_FOLLOW);

  return end === NOT_FOUND ? tokens : tokens.slice(0, end);
};

const runsAServerScript = (tokens: string[]): boolean =>
  PACKAGE_RUNNERS.has(tokens[0] ?? "") &&
  beforeArguments(tokens).some((token) => SERVER_SCRIPTS.has(token));

const runsADevServer = (tokens: string[]): boolean => {
  const tool = tokens.findIndex((token) => DEV_SERVER_TOOLS.has(token));

  return tool !== NOT_FOUND && beforeArguments(tokens.slice(tool + 1)).some((token) => DEV_SUBCOMMANDS.has(token));
};

const follows = (tokens: string[]): boolean =>
  tokens[0] === FOLLOWER && tokens.some((token) => FOLLOW_FLAG.test(token));

const segmentNeverExits = (segment: string[]): boolean => {
  const tokens = withoutEnvironment(segment);

  return (
    runsAServerScript(tokens) ||
    runsADevServer(tokens) ||
    tokens.some((token) => SERVERS.has(token) || token === WATCH_FLAG) ||
    follows(tokens)
  );
};

export const commandNeverExits = (command: string): boolean =>
  segmentsOf(command).some(segmentNeverExits);
