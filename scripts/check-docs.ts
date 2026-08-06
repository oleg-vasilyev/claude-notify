import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";


const DOCUMENTS = ["README.md", "PLAN.md", "CLAUDE.md", "TECH-DEBT.md"];
const CLAUDE_MD_LINE_BUDGET = 130;
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

const readme = read("README.md");
const shownBy = new Map<string, string>();

for (const file of sourceFiles("src")) {
  const path = relative(resolve("src"), resolve(file)).split(/[\\/]/).join("/");
  const basename = path.split("/").pop() ?? path;
  const shownAlready = shownBy.get(basename);

  if (shownAlready !== undefined) {
    complain(
      `src/${path} and src/${shownAlready} share a basename — an editor tab shows only that, so one of them has to be renamed`
    );
  }

  shownBy.set(basename, path);

  if (!readme.includes(basename)) {
    complain(`README.md: src/${path} is not in the source tree it shows`);
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

const claudeLines = read("CLAUDE.md").split("\n").length;

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

console.log(`docs ok: ${DOCUMENTS.length} documents, links, tree and budget`);
