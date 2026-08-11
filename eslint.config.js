import unusedImports from "eslint-plugin-unused-imports";
import tsParser from "@typescript-eslint/parser";

// Lint rules that enforce the conventions in CLAUDE.md, so a convention is a
// build error rather than something a reviewer has to remember. Anything
// checkable mechanically belongs here; CLAUDE.md keeps only what needs
// judgement. The four inline rules have no core equivalent.

const project = {
  rules: {
    // "No comments in src/" — naming carries the intent, and an explanation
    // that does not fit in a name belongs in PLAN.md or CLAUDE.md. Config files
    // like this one are exempt: the rule only ever runs against src/.
    "no-comments": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          found: "No comments in src/ — say it in a name, or in PLAN.md.",
        },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              context.report({ loc: comment.loc, messageId: "found" });
            }
          },
        };
      },
    },
    // A number must be *named*: it may appear in a `const NAME = …` initializer
    // and nowhere else. This product is a pile of thresholds — minutes idle,
    // percent spent, seconds between polls — and an unnamed one is a bug that
    // reads as intent. 0 and 1 are exempt: an index or a step is not magic.
    "named-numbers": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          unnamed: "Name this number with a const — the intent has to fit in the name.",
        },
      },
      create(context) {
        const ALWAYS_CLEAR = new Set([0, 1]);

        const namesTheNumber = (node) => {
          for (let current = node.parent; current; current = current.parent) {
            switch (current.type) {
              case "VariableDeclarator":
                return current.parent.kind === "const";

              case "ArrowFunctionExpression":
              case "FunctionDeclaration":
              case "FunctionExpression":
                return false;

              default:
                break;
            }
          }

          return false;
        };

        return {
          Literal(node) {
            if (typeof node.value !== "number") {
              return;
            }

            const negated =
              node.parent.type === "UnaryExpression" && node.parent.operator === "-";
            const value = negated ? -node.value : node.value;

            if (ALWAYS_CLEAR.has(value) || namesTheNumber(node)) {
              return;
            }

            context.report({ node: negated ? node.parent : node, messageId: "unnamed" });
          },
        };
      },
    },
    // Every import belongs in the header. Imports are hoisted, so one that lands
    // lower down still runs, and the blank-line rule below cannot see it.
    "imports-first": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          late: "An import belongs in the header, above the first statement.",
        },
      },
      create(context) {
        return {
          Program(program) {
            const firstStatement = program.body.findIndex(
              (statement) => statement.type !== "ImportDeclaration"
            );

            if (firstStatement < 0) {
              return;
            }

            for (const statement of program.body.slice(firstStatement)) {
              if (statement.type === "ImportDeclaration") {
                context.report({ node: statement, messageId: "late" });
              }
            }
          },
        };
      },
    },
    // Exactly two blank lines after the last import, so the imports read as a
    // header rather than as the first statements.
    "blank-lines-after-imports": {
      meta: {
        type: "layout",
        fixable: "whitespace",
        schema: [],
        messages: {
          spacing: "Leave exactly two blank lines after the last import.",
        },
      },
      create(context) {
        const REQUIRED_BLANK_LINES = 2;

        return {
          Program(program) {
            const lastImportIndex = program.body.findLastIndex(
              (statement) => statement.type === "ImportDeclaration"
            );
            const lastImport = program.body[lastImportIndex];
            const firstStatement = program.body[lastImportIndex + 1];

            if (lastImport === undefined || firstStatement === undefined) {
              return;
            }

            const blankLines = firstStatement.loc.start.line - lastImport.loc.end.line - 1;

            if (blankLines !== REQUIRED_BLANK_LINES) {
              context.report({
                loc: lastImport.loc,
                messageId: "spacing",
                fix: (fixer) =>
                  fixer.replaceTextRange(
                    [lastImport.range[1], firstStatement.range[0]],
                    "\n".repeat(REQUIRED_BLANK_LINES + 1)
                  ),
              });
            }
          },
        };
      },
    },
  },
};

// The layering rule from CLAUDE.md as import bans. domain/ decides, edges/ act,
// the entry points at src/ wire them together — imports point only downward.
//
// Every zone sets the same rule name, and a later flat-config block REPLACES an
// earlier one for a file matched by both, so the globs below must not overlap.
// A ban is also a glob, and minimatch reads a leading `#` as a comment, so
// `#edges/**` would match nothing at all: alias bans are converted to a regex.
// Both traps are why a new zone is not finished until a deliberate violation
// has been seen to fail the lint.
const forbid = (bans, message) => {
  const globs = bans.filter((ban) => !ban.startsWith("#"));
  const aliases = bans.filter((ban) => ban.startsWith("#"));

  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...(globs.length > 0 ? [{ group: globs, message }] : []),
          ...aliases.map((alias) => ({ regex: `^${alias.replace("**", "")}`, message })),
        ],
      },
    ],
  };
};

const IMPURE = [
  "node:*",
  "koffi",
  "#app/**",
  "#presence/**",
  "#relay/**",
  "#state/**",
  "#telegram/**",
  "#usage/**",
  "**/presence/**",
  "**/relay/**",
  "**/state/**",
  "**/telegram/**",
  "**/usage/**",
];

export default [
  {
    ignores: ["node_modules/**", "reports/**"],
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts", "e2e/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "unused-imports": unusedImports,
      project,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "none" },
      ],
      curly: ["error", "all"],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "project/no-comments": "error",
      "project/imports-first": "error",
      "project/blank-lines-after-imports": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.spec.ts", "src/**/*.stub.ts"],
    rules: {
      "no-console": "error",
      "project/named-numbers": "error",
    },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: forbid(
      IMPURE,
      "domain/ is the pure core — it decides, it never reaches for a file, a socket, a clock or the OS. Pass what it needs as an argument."
    ),
  },
  {
    // The setup CLI, the relay, the log writer and the dev scripts are what a
    // person reads in a terminal: a wizard, a server you start and watch, the
    // log itself, and a gate reporting what it found.
    files: ["src/setup.ts", "src/relay.ts", "src/state/log.ts", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
