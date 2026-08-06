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
3. **Leave data tables real.** `copy.ts` is keys and text, not behaviour;
   mocking it would compare a constant against itself.

The corollary bites: **no logic may live in `copy.ts`.** Because the table is
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

```ts
import { readConfig } from "#edges/config.ts";
import { deliver } from "#edges/deliver.ts";


vi.mock("#edges/config.ts", () => ({ readConfig: vi.fn() }));
```

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

## Shape of the file

- Name every number: `const AWAY_SECONDS = 600`.
- One behaviour per `it`, phrased as what the subject does — "queues while the
  user is at the keyboard", not "test queue".
- Separate arrange, act and assert with blank lines.
- Assert the thing that would break, not the thing that is easy to reach.
- No comments: the case name is the sentence.

## What is deliberately outside coverage

`vitest.config.ts` excludes the four entry points and five edge modules —
`paths.ts`, `presence.ts`, `telegram.ts`, `usage-api.ts`, `watcher-process.ts`.
They hold no decisions: each is the seam with somebody else's API, and a unit
that mocks `fetch` in order to watch `fetch` be called proves nothing about our
code. What they do is proven by sending a real ping, which the `finish-phase`
skill makes a gate.

That list is an argument, not a hiding place. A file joins it only when it has
nothing to decide — the moment one grows a branch, the branch belongs in
`domain/` where it can be tested, and the file stays thin.

## Judging a spec you did not write

1. Does it import anything unmocked besides its subject and `copy.ts`?
2. Does any assertion belong to another module? A `deliver` spec checking how a
   percentage is rounded is really testing `usage.ts`.
3. **Would every assertion fail if the subject broke?** This is what the
   mutation score answers, and it is the question that matters most here.
4. **Is the fixture doing the work?** The installer's duplicate-hook bug shipped
   with a green spec because the fixture path happened to contain the product
   name the code was searching for. When a test and the code under test agree on
   an assumption, the test proves nothing. Vary the fixture along the axis the
   code claims not to care about.
5. Does any assertion stand on a `filter` or a `find` that could match nothing?
   Assert the selection is non-empty before asserting anything about it.
