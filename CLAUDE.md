# claude-notify — how the code here is written

This file is loaded before every session, so it holds only what has to be known
*before* the first edit. Anything needed for one specific job lives in a skill:

| Doing this | Read |
|---|---|
| Adding or changing a hook event | `add-a-hook-event` skill |
| Writing or changing any spec | `write-a-spec` skill |
| Touching config, the installer, a gate or a doc | `finish-phase` skill |
| Writing or changing any document | `write-a-doc` skill |

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
Also `strict`, `noUncheckedIndexedAccess`, and **no `any`**.

**There are no relative imports in `src/`** — every specifier is a `#domain/…`,
`#state/…` or `#app/…` subpath alias declared in `package.json`, so an import
reads the same wherever it sits, and a layering violation is visible in the line.

**Settings live in `.env`**, read through `domain/env-file.ts` and mapped in
`state/config.ts`. `docs:check` fails unless it is gitignored and `.env.example`
lists every key — the token must never be committed.

## Two kinds of module, and the rule between them

```
src/
  domain/     every decision, pure: state in as arguments, verdict out as a value
    ping/ asking/ setup/   one folder per thing being decided about
  state/      what is remembered between runs: settings, log, queue, stamps, lock
  presence/   whether the user is at the keyboard
  telegram/   talking to Telegram
  relay/      forwarding for a machine that cannot reach Telegram
  usage/      the account's limit windows
  deliver.ts  the funnel every ping goes through
  hook.ts notify.ts mcp.ts watcher.ts relay.ts setup.ts   entry points
```

Everything outside `domain/` is impure, and **each folder is named after its
subject rather than after its position** — an `edges/` or `io/` bucket says what
its contents are *not*, which is the vagueness the file names were cured of. A
folder holding one module is fine; **`docs:check` fails past twelve**, because a
folder whose subject no longer fits in one phrase has become a bucket.

**`domain/` may not import `node:*`, `koffi`, or anything impure.** No
file, no socket, no clock — a function that needs the time takes a `Date` or a
number of milliseconds. This is what makes a delivery rule testable in
milliseconds instead of by walking away from the keyboard for three minutes,
and it is a **lint zone, not an aspiration**: `eslint.config.js` fails the build.

Entry points are composition roots: they read argv or stdin, call one domain
function, hand the verdict to one edge. A branch worth naming — or a string
another program will parse — belongs in `domain/`, the only place it gets a
spec: an argv built inline in `setup.ts` shipped `C:\Program` past every gate.

**`domain/copy.ru.ts` is the only file in the product that may hold Russian** —
the `.ru` is in the name so a stray string elsewhere reads as the mistake it is.
It holds both what is sent (`copy`) and the Russian the payload has to be
*recognised* by (`recognise`). There is no locale table: one reader, one
language, and a `copyIn(locale)` switch would be ceremony. A copy function
interpolates and never decides — choosing between `1 ч` and `1 ч 12 мин` is
`duration.ts`'s job, not the table's. Everything else — code, errors, comments,
commits, docs — is English.

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
- **Prefer a discriminated union over a nullable plus a separate reason**, spell
  its members in a `const` table (`DELIVERY`, `ASK_VERDICT`) so no `case` repeats
  a bare string, and close every `switch` with `default: impossible(x)` — TS
  alone misses a missing case whenever the switch returns `void`.
- **A file name has to survive being read on its own.** An editor tab shows
  `pending.ts`, not its folder, so the name says what is inside.
- **Only this project exists here.** No other project is named in a fixture, an
  example or a commit — this repository is public, and `a-project` costs nothing
  where a real name would publish somebody's work. `docs:check` guards it.
- **Keep functions pure where you can**, and keep the impure ones small enough
  that what they do fits in their name.

## Tests and gates

Specs sit next to the code as `*.spec.ts`, and `domain/` is covered
exhaustively — every branch that changes a delivery. What to mock, what earns an
integration spec or an e2e scenario, and what is outside coverage are in the
`write-a-spec` skill.

```bash
npm run check
```

Lint, types, docs and tests — the gate to keep at zero. Three more before a
release: `npm run test:coverage` (floor 80%), `npm run test:mutation` (breaks
below 85%) and `npm run e2e`, the real hook process against a fake Telegram.
The numbers go in the commit message; `finish-phase` has the ritual.

A `PostToolUse` hook lints each file as it is written, so a violation surfaces
at the edit rather than at the end of the turn.

**Say how big a phase is before starting it**, in a line, so it can be argued
down. When adding a gate, first commit a deliberate violation to watch it fail.
And before calling anything done, **send a real ping** — every user-visible bug
here was found that way, never by a spec.
