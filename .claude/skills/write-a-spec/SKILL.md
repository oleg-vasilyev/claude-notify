---
name: write-a-spec
description: Write or rewrite a test in claude-notify — what to mock, how to name and structure cases, and when a test is allowed to be an integration spec instead. Use whenever adding a *.spec.ts, changing an existing one, or judging whether a spec is testing the file it names.
---

# Writing a spec

## The rule

**A spec tests one file. Everything that file imports is mocked.**

Not "the awkward parts" — everything: `koffi`, `node:fs`, `fetch`, the sibling
module in the next folder. Three consequences:

1. **Never exercise third-party code in a unit.** Their authors have their own
   tests, and a spec that drives them reports on their code while claiming to
   report on ours. When one breaks, the failure points at the wrong file.
2. **Mock our own modules too.** `deliver.ts` is not tested by letting
   `decideDelivery` really run — mock it, drive the funnel by what it returns,
   and a wrong verdict fails in `delivery.spec.ts` where the fault is.
3. **Leave data tables real.** `copy.ru.ts` is keys and text, not behaviour;
   mocking it would compare a constant against itself.

The corollary bites: **no logic may live in `copy.ru.ts`.** Because the table is
never mocked, a decision taken inside it is asserted against itself and is
therefore unkillable by mutation testing. Choosing between `1 ч` and
`1 ч 12 мин` is `duration.ts`'s job; the table only interpolates.

## `domain/` needs no mocks at all

That is the point of the layer. A domain spec is arguments in, value out — no
`vi.mock`, no fixtures beyond a literal, and it runs in a millisecond. If a
domain spec needs a mock, the function is not pure and the fix is in the source,
not in the spec.

The clock is an argument. `decideDelivery` takes `now`, `usageLine` takes a
`Date`, `selectPending` takes `now`. Never `vi.useFakeTimers()` for a domain
test — a function that reads the clock itself has already failed the layer rule.

## Mocking in an edge spec

`vi.mock` is hoisted above the imports, so the imports read normally and the
factories run when the mocked module is first requested:

**Mock a module partially, never wholly.** A factory returning only the function
you care about silently deletes everything else the module exports, and the code
under test then receives `undefined` for a constant it was reading:

```ts
import { readConfig } from "#state/config.ts";
import { deliver } from "#app/deliver.ts";


vi.mock("#state/config.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#state/config.ts")>()),
  readConfig: vi.fn(),
}));
```

Paid for once: `state/config.ts` grew a `DELIVERY` table, three specs replaced
the whole module with `{ readConfig: vi.fn() }`, and thirty-two cases failed with
a stack pointing at the production line rather than at the fake. **A wholesale
mock makes a failure lie about where the bug is**, which costs more than the
failure itself.

`clearMocks: true` in `vitest.config.ts` resets every spy between cases, so a
`beforeEach` sets the defaults and each case overrides exactly one thing. A spy
left dirty by the case above is the classic source of a passing test that proves
nothing — it was already caught here once, when five cases in
`deliver.spec.ts` passed on calls made by their predecessors.

**A fake never reimplements what it replaces.** If a factory needs an `if`, a
lookup or a loop to satisfy its caller, it has stopped being a fake and started
being a second implementation, and the test then passes because the fake works.
Return a fixed value and assert the call.

## Integration specs

**An integration spec covers a seam the unit rule puts out of reach** — not
"mocking was inconvenient". One shape earns it here: a promise about the file
system that a mock cannot make. `store.integration.spec.ts` writes to a real
temporary directory, because "the queue survives a crash" is a claim about
files, and a mocked `writeFileSync` would assert that we called a function.

Name it `*.integration.spec.ts` so nobody mistakes it for the default, point the
paths module at a temp directory with `vi.hoisted`, and delete the directory in
`afterAll`.

## E2E scenarios

`e2e/` plays the **real `hook.ts` process** against a fake Telegram HTTP server,
pointed at a throwaway state directory by `CLAUDE_NOTIFY_HOME`,
`CLAUDE_NOTIFY_ENV` and `BOT_API_ROOT`. It is the slowest thing here and runs as
a release gate, not in `check`, so one is owed only for what no unit can reach:

- **An inline keyboard.** Whether a tap finds the hook waiting for it is a fact
  about two processes and a real socket, and the answering flow is the only
  feature that has them.
- **A bug that got past the units.** That is evidence the seam is real.

Nothing in `e2e/` may import from `src/` except the entry point it spawns — no
types, no `copy.ru.ts`. A harness that imported the copy table would assert a
constant against itself, so expected Russian is written out in full.

A scenario never sleeps and never polls: the fake server exposes `whenAsked()`
and `whenAcknowledged()`, and if you reach for a timer the verb you want is
missing from the harness and belongs there.

Presence is real win32 in a spawned process, so a scenario sets
`MIN_IDLE_MINUTES=0` rather than trying to fake being away.

## Shape of the file

- Name every number: `const AWAY_SECONDS = 600`.
- One behaviour per `it`, phrased as what the subject does — "queues while the
  user is at the keyboard", not "test queue".
- Separate arrange, act and assert with blank lines.
- Assert the thing that would break, not the thing that is easy to reach.
- No comments: the case name is the sentence.

## Where the specs live and what each tier is for

Specs sit next to the code as `*.spec.ts`. `domain/` is covered exhaustively —
every function, every branch that changes a delivery. `deliver.ts` is covered
with every impure module mocked, because it is the funnel where the wiring can
be wrong. `state/` earns an `*.integration.spec.ts` against a real temporary
directory, since a file that survives a crash is exactly what a mock cannot
prove.

## What is deliberately outside coverage

`vitest.config.ts` excludes the four entry points and four modules —
`file-locations.ts`, `idle-time.ts`, `telegram-api.ts`, `usage-api.ts` — plus
`watcher-process.ts`. They hold no decisions: each is the seam with somebody
else's API or the OS, and a unit
that mocks `fetch` in order to watch `fetch` be called proves nothing about our
code. What they do is proven by sending a real ping, which the `finish-phase`
skill makes a gate.

That list is an argument, not a hiding place. A file joins it only when it has
nothing to decide — the moment one grows a branch, the branch belongs in
`domain/` where it can be tested, and the file stays thin.

## Judging a spec you did not write

1. Does it import anything unmocked besides its subject and `copy.ru.ts`?
2. Does any assertion belong to another module? A `deliver` spec checking how a
   percentage is rounded is really testing `usage.ts`.
3. **Would every assertion fail if the subject broke?** This is what the
   mutation score answers, and it is the question that matters most here.
4. **Is the fixture doing the work?** The installer's duplicate-hook bug shipped
   with a green spec because the fixture path happened to contain the product
   name the code was searching for. When a test and the code under test agree on
   an assumption, the test proves nothing. Vary the fixture along the axis the
   code claims not to care about. **When one value is derived twice in different
   places, the axis is whatever makes the two derivations disagree** — a project
   key was taken from the raw message where a ping is sent and from the labelled
   message where the queue looks it up, and every fixture carried a project
   prefix, the one shape where both routes give the same answer.
5. Does any assertion stand on a `filter` or a `find` that could match nothing?
   Assert the selection is non-empty before asserting anything about it.
6. **When the subject hardens a parser, does the fixture list include the input
   that parses and *then* explodes?** The queue reader was written to survive
   broken lines and tested against three of them — a truncated object, a missing
   field, an empty line — all of which fail at `JSON.parse`. `null` is a valid
   JSON document, so it sails through the `try` and throws on the first property
   access, and one such line in `pending.jsonl` strands the whole queue with no
   log line at all. Malformed is two categories, not one: **what will not parse,
   and what parses into something that is not the shape.**
