---
name: finish-phase
description: Run the release ritual that closes a development phase in claude-notify — the gates (check, coverage, mutation, e2e when answering changed, diff review, retrospective), the live proof, and the format of the phase's final commit message. Use when a phase is being wrapped up or the user asks whether the code is releasable.
---

# Finishing a phase

A phase is done when the code is *releasable*, not when it works. Run all the
gates before the final commit and act on what they say. None is advisory.

## 1. `npm run check`

Lint, types, docs, tests. Zero errors, no exceptions.

Most conventions are ESLint rules, so a lint failure is a convention violation
rather than a nit — read the message before reaching for a disable comment.
`docs:check` runs inside this gate, so a broken link or an undocumented module
fails here rather than surviving to the next cleanup.

## 2. `npm run test:coverage`

80% floor on every metric. A file that dropped is a file whose new branches
nobody exercised — find the branch, not a way to reach the number.

Files outside coverage are listed in `vitest.config.ts` and justified in the
`write-a-spec` skill. Adding to that list is a decision to argue for in the
commit message, not a way to pass this gate.

## 3. `npm run test:mutation`

Stryker over `domain/`, about thirty seconds. Breaks below 85%. Coverage says a
line ran; this says a test would have noticed it break.

A file that dropped is a file whose new tests assert too little — strengthen the
tests, never lower the bar. Load the `write-a-spec` skill rather than reaching
for the nearest assertion that turns the mutant red.

Three rules about running it, and the first is the one that costs money:

- **Never re-run a gate to re-read its output.** Every run writes
  `reports/mutation/`. Read the report.
- **One round of survivor-killing per phase**, and only for mutants whose death
  would prevent a bug the user could see. Above roughly 95% the survivors are
  mostly equivalent mutants. A survivor left alive on purpose is worth a
  sentence in the commit message, not another round.
- **Moving code moves its mutants** — re-run after a split or a rename.
  Assertions do not always survive being ported.

## 3b. `npm run e2e`

Only when the phase touched answering — the hook's stdout contract, the
question/answer files, or anything in `telegram/`. It spawns the real `hook.ts`
against a fake Telegram, so it is minutes, not seconds, and it is the only gate
that proves two processes still meet.

A failure here is rarely in the harness. Read which scenario broke before
touching `e2e/`.

## 4. A review pass over the phase's whole diff

Read `git diff <phase-start>..HEAD` against `CLAUDE.md` — the whole diff at
once, not commit by commit, because a rule breaks across commits more often than
inside one. The `phase-reviewer` subagent exists for this pass.

**Stop editing before you launch it.** The reviewer reads files, not a snapshot,
so a tree that moves under it produces findings against code that no longer
exists.

**Run any rule the phase itself introduced against the phase's own diff,
first.** A new rule is at its least believed by the person who just wrote it,
because they are still holding the reasoning that made it obvious.

## 5. A retrospective

Gate 4 judges the diff; this judges what producing it cost. Load the
**`retrospective`** skill, answer its questions with counts, and land each lesson
somewhere durable. It runs before the final commit, while the transcript that is
its evidence still exists.

## The gate the gates cannot replace: send a real ping

Every hook path ends at Telegram, and no test crosses that boundary. Before
calling a phase done, fire the changed path for real:

```bash
node src/notify.ts --message "[claude-notify] проверка фазы" --now
echo '{"cwd":"D:\\Temp\\FoolProof","tool_name":"Bash"}' | node src/hook.ts PermissionRequest
```

then read `~/.claude/claude-notify/log.txt` and look at the message that
arrived. This is not ceremony. Every bug that has reached a user in this project
was found here and not by a test: the duplicate hook registrations, the mangled
Cyrillic, the log stamped in UTC. Tests agree with the assumptions of the code;
a real ping does not.

If the phase touched the installer, run `npm run setup -- --label home
--skip-test` **twice** and confirm `~/.claude/settings.json` gained exactly one
entry per event. Idempotence is the property that breaks silently.

## The documents the phase owes

Load the **`write-a-doc`** skill before touching any of them: it routes a fact to
one file and says how to add it without creating the second copy that will drift.

## Scaling the ritual

The gates are not negotiable; what the phase produces around them is. A
phase that stays inside `domain/`, adds no edge and changes no message the user
reads owes a `PLAN.md` line at most. A phase that changes what a ping says, or
what the installer writes into somebody's `settings.json`, owes a section.

**Say how big the phase is before starting it**, in one line, so the user can
argue it down.

## The final commit message

Put the numbers in it — spec count, coverage, mutation score — so a later
regression has something to be compared against. State what changed and **why
the previous shape was wrong**. A commit message that says what a reader could
get from the diff has wasted itself.
