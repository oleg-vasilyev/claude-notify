import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";


const DOCUMENTS = ["README.md", "PLAN.md", "CLAUDE.md", "TECH-DEBT.md"];
const CLAUDE_MD_LINE_BUDGET = 130;
const FOLDER_BUDGET = 12;
const FIXTURE_NAMES = new Set([
  "a-project",
  "another-project",
  "live-check",
  "claude-notify",
  "proj",
  "a",
  "b",
  "setup",
  "Temp",
  "…",
]);
const PING_PREFIX = /\[([^\]@\s"[]+)@/g;
const CWD_FIXTURE = /cwd"?:\s*"([^"]*)"/g;
const PATH_SEPARATOR = /[\\/]+/;
const LOCAL_LINK = /\[[^\]]*\]\((?!https?:)([^)]+)\)/g;
const HEADING = /^#+\s+(.+)$/gm;
const FENCE = /```[\s\S]*?```/g;
const NOT_IN_A_SLUG = /[^\w\s-]/g;
const SPACES = /\s+/g;

const problems: string[] = [];

const complain = (problem: string): void => {
  problems.push(problem);
};

const read = (path: string): string => readFileSync(path, "utf8");

const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(NOT_IN_A_SLUG, "")
    .trim()
    .replace(SPACES, "-");

const anchorsIn = (markdown: string): Set<string> => {
  const anchors = new Set<string>();

  for (const [, heading] of markdown.matchAll(HEADING)) {
    if (heading !== undefined) {
      anchors.add(slug(heading));
    }
  }

  return anchors;
};

const exists = (path: string): boolean => {
  try {
    statSync(path);

    return true;
  } catch {
    return false;
  }
};

const everyFileUnder = (directory: string, suffixes: string[]): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return everyFileUnder(path, suffixes);
    }

    return suffixes.some((suffix) => entry.name.endsWith(suffix)) ? [path] : [];
  });

const lastSegmentOf = (path: string): string => {
  const segments = path.split(PATH_SEPARATOR).filter((segment) => segment !== "");

  return segments[segments.length - 1] ?? "";
};

const onlyOurOwnNames = (path: string, text: string): void => {
  for (const [, named] of text.matchAll(PING_PREFIX)) {
    if (named !== undefined && !FIXTURE_NAMES.has(named)) {
      complain(
        `${path}: the ping prefix [${named}@…] names a project that is not this one — a fixture names the check, never somebody's real work`
      );
    }
  }

  for (const [, cwd] of text.matchAll(CWD_FIXTURE)) {
    const project = cwd === undefined ? "" : lastSegmentOf(cwd);

    if (project !== "" && !FIXTURE_NAMES.has(project)) {
      complain(
        `${path}: the cwd fixture ends in ${project}, which is not one of this project's reserved fixture names`
      );
    }
  }
};

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });

for (const document of DOCUMENTS) {
  const markdown = read(document);

  for (const [link, target] of markdown.matchAll(LOCAL_LINK)) {
    if (target === undefined) {
      continue;
    }

    const [path, anchor] = target.split("#");
    const file = path === "" || path === undefined ? document : path;

    if (!exists(file)) {
      complain(`${document}: ${link} points at a file that is not there`);
      continue;
    }

    if (anchor !== undefined && !anchorsIn(read(file)).has(anchor)) {
      complain(`${document}: ${link} points at a heading that is not in ${file}`);
    }
  }
}

for (const document of DOCUMENTS) {
  onlyOurOwnNames(document, read(document));
}

for (const file of [
  ...everyFileUnder("src", [".ts"]),
  ...everyFileUnder("e2e", [".ts"]),
  ...everyFileUnder(".claude", [".md", ".json"]),
]) {
  onlyOurOwnNames(file, read(file));
}

const readme = read("README.md");
const shownBy = new Map<string, string>();
const modulesIn = new Map<string, number>();

for (const file of sourceFiles("src")) {
  const path = relative(resolve("src"), resolve(file)).split(/[\\/]/).join("/");
  const basename = path.split("/").pop() ?? path;
  const folder = path.slice(0, -basename.length - 1);
  const shownAlready = shownBy.get(basename);

  if (shownAlready !== undefined) {
    complain(
      `src/${path} and src/${shownAlready} share a basename — an editor tab shows only that, so one of them has to be renamed`
    );
  }

  shownBy.set(basename, path);
  modulesIn.set(folder, (modulesIn.get(folder) ?? 0) + 1);
}

for (const [folder, modules] of modulesIn) {
  if (modules > FOLDER_BUDGET) {
    complain(
      `src/${folder} holds ${modules} modules against a budget of ${FOLDER_BUDGET} — a folder past that has stopped being one subject, so split it by what its parts are about`
    );
  }
}

const scripts = Object.keys(
  (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts
);

for (const fence of readme.match(FENCE) ?? []) {
  for (const [, script] of fence.matchAll(/npm run ([\w:]+)/g)) {
    if (script !== undefined && !scripts.includes(script)) {
      complain(`README.md: npm run ${script} is not a script in package.json`);
    }
  }
}

const ignored = read(".gitignore")
  .split("\n")
  .map((line) => line.trim());

if (!ignored.includes(".env")) {
  complain(".gitignore does not ignore .env — the bot token would be committed");
}

const example = read(".env.example");

for (const [, key] of read("src/state/config.ts").matchAll(/settings\.([A-Z_]+)/g)) {
  if (key !== undefined && !example.includes(key)) {
    complain(`.env.example does not list ${key}, which config.ts reads`);
  }
}

const claudeLines = read("CLAUDE.md").trimEnd().split("\n").length;

if (claudeLines > CLAUDE_MD_LINE_BUDGET) {
  complain(
    `CLAUDE.md is ${claudeLines} lines against a budget of ${CLAUDE_MD_LINE_BUDGET} — move a paragraph into the skill it belongs to rather than raising the number`
  );
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }

  process.exit(1);
}

console.log(
  `docs ok: ${DOCUMENTS.length} documents, links, secrets, file names and both budgets`
);
