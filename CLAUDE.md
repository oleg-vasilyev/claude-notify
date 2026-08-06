# claude-notify — how the code here is written

Four documents, one job each: `README.md` for arriving and installing, `PLAN.md`
for behaviour and the reasons behind it, this file for style and gates,
`TECH-DEBT.md` for what is deliberately unfinished. The dividing question:
*would the fact survive a rewrite in another language?* Yes → `PLAN.md`; no →
here. A fact lives where its reason lives; the other file gets a pointer, never
a retelling.

That split earned itself: this product was written twice, in PowerShell and
then in TypeScript, and `PLAN.md` survived the move almost untouched while this
file was thrown away and written again.

## There is no build step

Node 24 runs the TypeScript directly by stripping types, so what a hook
executes is the file you edit. `tsconfig.json` mirrors that rather than
describing a compiler: `erasableSyntaxOnly` and `verbatimModuleSyntax` keep the
source strippable (no enums, no namespaces, `import type` for types), and
`allowImportingTsExtensions` matches the explicit `.ts` in every import path.

`strict: true`, `noUncheckedIndexedAccess`, and **no `any`**.

**There are no relative imports in `src/`** — every specifier is a `#domain/…`
or `#edges/…` subpath alias declared in `package.json`, so an import reads the
same wherever it sits, and a layering violation is visible in the line itself.

## Two layers, and the rule between them

```
src/
  domain/   every decision, pure: state in as arguments, verdict out as a value
  edges/    every effect: files, HTTP, win32, spawning
  hook.ts     entry point: Claude Code fires it, one event per invocation
  notify.ts   entry point: the model or a human sends one ping
  watcher.ts  entry point: delivers what presence held back
  setup.ts    entry point: the installer
```

**`domain/` may not import `node:*`, `koffi`, or anything from `edges/`.** No
file, no socket, no clock — a function that needs the time takes a `Date` or a
number of milliseconds. This is what makes a delivery rule testable in
milliseconds instead of by walking away from the keyboard for three minutes,
and it is a **lint zone, not an aspiration**: `eslint.config.js` fails the
build. The zone was proven by committing a deliberate `import { readFileSync }`
into `domain/` and watching it fail — a zone that never fires looks exactly
like a zone with nothing to report.

Entry points are composition roots: they read argv or stdin, call one domain
function, hand the verdict to one edge. When an entry point grows a branch
worth naming, that branch belongs in `domain/`.

**Everything the user reads in Telegram lives in `domain/copy.ts`** and nothing
else contains a Russian string. There is no locale table: the product has one
reader and one language, and a `copyIn(locale)` switch would be ceremony. A
copy function interpolates and never decides — choosing between `1 ч` and
`1 ч 12 мин` is `duration.ts`'s job, not the table's.

Code, comments, commits and docs are English. Only what reaches Telegram is
Russian.

## Style

Anything a machine can check is a lint rule, not a paragraph. What is left
needs judgement:

- **No comments in `src/`** — `project/no-comments` enforces it. A name carries
  the intent, and an explanation that will not fit in a name belongs in
  `PLAN.md`. The PowerShell version allowed comments because its traps were too
  obscure to name; that excuse left with PowerShell.
- **A number must be named by a `const`** — `project/named-numbers`. This
  product is a pile of thresholds, and an unnamed one reads as intent while
  behaving as an accident.
- **Prefer a discriminated union over a nullable plus a separate reason.**
  `decideDelivery` returns `{ kind: "queue"; idleSeconds }` rather than a
  boolean and an out-parameter, so the caller's `switch` is exhaustive and
  adding an outcome becomes a compile error everywhere obliged to handle it.
- **A file name has to survive being read on its own.** An editor tab shows
  `pending.ts`, not its folder, so the name says what is inside: `usage.ts`
  holds the usage line, `presence.ts` answers whether you are at the keyboard.
- **Keep functions pure where you can**, and keep the impure ones small enough
  that what they do fits in their name.

`project/named-states` from the reference project is deliberately **not**
adopted: it exists there because states are spelled across many features, and
here one small union lives beside its only consumer.

## Tests and gates

Specs sit next to the code as `*.spec.ts`. `domain/` is covered exhaustively —
every function, every branch that changes a delivery. `edges/deliver.ts` is
covered with every edge mocked, because it is the funnel where the wiring can
be wrong. `edges/store.ts` earns an `*.integration.spec.ts` against a real
temporary directory, since a file that survives a crash is exactly what a mock
cannot prove.

Four files are outside coverage on purpose, and it is not a fudge: `paths.ts`,
`presence.ts`, `telegram.ts`, `usage-api.ts`, `watcher-process.ts` and the
entry points hold no decisions — they are the seam with somebody else's API. A
unit that mocks `fetch` to watch `fetch` be called proves nothing; what they do
is proven by sending a real ping.

```bash
npm run check
```

Lint, types, tests — the gate to keep at zero. Two more before a release:
`npm run test:coverage` (floor 80%) and `npm run test:mutation` (breaks below
85%), and the numbers go in the phase's commit message.

**Say how big a phase is before starting it**, in a line, so it can be argued
down. And when adding a gate, first commit a deliberate violation to watch it
fail.
