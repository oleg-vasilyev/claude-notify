---
name: finish-phase
description: Run the release ritual that closes a development phase in claude-notify — the gates (check, coverage, mutation, e2e when answering changed, diff review, retrospective), the live proof, and the format of the phase's final commit message. Use when a phase is being wrapped up or the user asks whether the code is releasable.
---

# Finishing a phase

A phase is done when the code is *releasable*, not when it works. Run all the
gates before the final commit and act on what they say. None is advisory.

## What counts as a phase

Not "what the user called a phase". **Load this skill whenever the diff does any
of these**, whatever the work was announced as — a cleanup and a refactor both
qualify, and asking permission to run the ritual is not the same as running it:

- changes a key in `.env`, or the shape of anything in `state/config.ts`
- changes what the installer writes into somebody's machine
- adds, removes or retunes a gate
- edits any of the four documents

Paid for once: a cleanup rewrote the config shape, moved thirteen modules, added
a gate and touched all four documents, and the ritual was skipped because nobody
had said the word "phase". The user had to ask why.

## 1. `npm run check`

Lint, types, docs, tests. Zero errors, no exceptions.

**It is the gate, so do not hand-run its parts and then run it too.** Iterating
with `npm run typecheck` while fixing types is right; following that with the
individual `lint` and `test` before `check` re-runs all three for nothing. One
cleanup spent six redundant sub-runs that way.

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

**It is numbered 3 but it runs after gate 4.** A mutation score is a claim about
the *specs*, so a review that rewrites one invalidates the run that preceded it.
Paid for in the phase that renamed the limits block's markup: three mutation runs
at 2.8 minutes each, of which two were spent on specs the review then changed.
Run the review first, act on its findings, and let one mutation run measure the
tree that will be committed — the same argument the last three gates already
make, extended to this one.

Three rules about running it, and the first is the one that costs money:

- **Never re-run a gate to re-read its output.** Every run writes
  `reports/mutation/`. Read the report.
- **Never pipe a gate through `Select-Object -First`.** It closes the pipe, npm
  dies at exit 255 partway through, and the summary you were filtering for never
  prints — so the run is lost and the only way to see the number is to run it
  again. That is the rule above, broken by the command meant to save reading.
  Let a gate print in full, or read its report file.
- **One round of survivor-killing per phase**, and only for mutants whose death
  would prevent a bug the user could see. Above roughly 95% the survivors are
  mostly equivalent mutants. A survivor left alive on purpose is worth a
  sentence in the commit message, not another round.
- **Moving code moves its mutants** — re-run after a split or a rename.
  Assertions do not always survive being ported.
- **A surviving mutant is not always a missing test.** The relay produced three,
  and all three were one `catch` broad enough to swallow the difference;
  narrowing it to the one call that can really fail killed two and left better
  code. Look at the code before reaching for an assertion.
- **This gate pays you for deleting guards, so raising it is a change like any
  other and goes through gate 4.** `decideDelivery` went 79% to 91% by removing
  a `rateLimitMinutes > 0` that turned out to be load-bearing; the score rose
  because the mutants went with it. Nothing here can catch that — only the
  review did.

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

**It finds what the other gates structurally cannot.** Mutation testing can only
mutate code that is there — so when a phase *deletes* a guard, no mutant exists
to survive and the score goes up. That is exactly how a rewritten `decideDelivery`
lost "a rate limit of zero never skips" with every gate green. Give the reviewer
the phase's intent in the brief, so it can check the diff against what was meant
rather than only against the rules.

**Run any rule the phase itself introduced against the phase's own diff,
first.** A new rule is at its least believed by the person who just wrote it,
because they are still holding the reasoning that made it obvious.

**A fallback is a table, and a table is a domain function.** Two phases running,
the reviewer has had to send the same shape back: wiring a second source — a
cache, a stale reading, an alternative endpoint — produces at least three
outcomes (it arrived / only the kept one is left / neither), each with its own
thing to say, and writing those branches where the data happens to be puts them
in an entry point no spec reaches. Both times the cost was the same: a log line
that named the wrong reason, and a case nobody tested. When a phase adds a
fallback, write the verdict function first.

**A measured threshold is only licensed over the population it was measured
on.** The moved-on rule's five seconds came from 46 real `Stop` events, and the
code then applied it to all four hook events — where the premise is false,
because a mid-turn session keeps writing while the wait is genuinely open. The
measurement was right, the number was right, and the scope was invented. When a
phase justifies a constant with evidence, **say out loud what the evidence
covers, and let that be the guard in the code.**

**Check the prose the model reads against the code it describes.** A tool
description, a memory rule, an error string — these are product copy that makes
promises about behaviour, and nothing in `check`, coverage, mutation or e2e can
notice when one stops being true. `ping_user`'s description told the model its
ping would be dropped if the session moved on; the drop needs a transcript path
that channel never has. Only the reviewer could see it, so name every promise the
diff makes in the brief.

**Write the four documents before gate 4, not after, and do not run `check` in
between.** The review changes them — twice now, a phase has paid for one `check`
run over documents the reviewer then rewrote.

**When you break something on purpose to watch a check fail, confirm the break
landed.** Files here are CRLF, so a `node -e` replacement written with `\n`
silently matches nothing — three times in one phase, and once the tests then
"passed" against source that had never been touched, which reads exactly like a
check that is working. Edit the file, re-read it, then run.

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
node src/hook.ts PermissionRequest < .claude/skills/finish-phase/payload.json
```

then read `~/.claude/claude-notify/log.txt` and look at the message that
arrived. This is not ceremony. Every bug that has reached a user in this project
was found here and not by a test: the duplicate hook registrations, the mangled
Cyrillic, the log stamped in UTC. Tests agree with the assumptions of the code;
a real ping does not.

**A change to markup is only proved in the narrowest shape the product uses.**
Telegram validates entities per method and lays them out per bubble, and the fake
server in `e2e/` refuses nothing — so no gate but this one can see a rendering
break. A ping's text goes out as a message *or* as a picture caption, and a
caption is narrower: the phase that moved the limits block from `<pre>` to
`<blockquote><code>` was settled by three variants sent to the phone as messages,
where all three fit, and shipped a block that wrapped in a caption — the quote
wraps where a code block scrolls, and the busy row lost its columns. Send both
shapes, and send the widest content the block can hold rather than a typical one.

**The payload comes from a file because no shell here delivers it intact.** The
`echo '{"cwd":"…"}' | node` line this used to print was tried three ways — bash
ate the backslashes twice and PowerShell mangled the encoding — and `hook.ts`
treats unparseable JSON as an empty payload, so all three exited 0 and logged a
ping with no project and no tool name. A live check that passes while proving
nothing is worse than no live check.

Its `cwd` is `D:\live-check`, which is not a directory and does not need to be:
`projectPrefixOf` takes the last segment and nothing else, so the fixture names
the check rather than borrowing somebody's real project.

**Read the line, not the exit code.** It has to name the project and the tool:
`[live-check@…] просит разрешение: Bash`. A bare `[<label>] просит разрешение:
инструмент` means the payload never arrived.

**That second command blocks for `ASK_MINUTES` when you are away.**
`PermissionRequest` goes through the ask path, so if the machine reads as idle
it puts a real question on the phone with real buttons and waits ten minutes for
a tap. Expect `ASKED`, not `просит разрешение`, and kill it — then delete the
stranded `question-<id>.json` from the state directory, or the watcher keeps
polling for an answer to a question nobody will send, and the message sits on the
phone forever because the process that would have closed it is gone.

**A live check in a sandbox spawns a watcher that will block the next one.** Any
hook run that queues a ping starts a detached watcher, which claims the lock in
`CLAUDE_NOTIFY_HOME` and holds the config it started with. A watcher run by hand
afterwards exits silently at once. Kill the pid in `watcher.lock` and delete the
lock between the queueing step and the flushing step — and do not delete
`log.txt` while wondering why nothing was logged.

**Run it after gate 4, never beside it — and the same goes for `e2e`.** Both
fire the working tree, so a finding that lands mid-run proves nothing about what
will be committed. Neither is cheap: a queue drop only happens while the user is
genuinely away, so one live check sat waiting six minutes for an untouched
keyboard and then had to be killed when the review came back with a rename; and
`e2e` is 3.4 minutes a run, of which two of three runs in one phase were spent on
code the review then changed. The review is the cheap thing to run early. Order
the last three gates review → `e2e` → live ping, and run each once.

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
regression has something to be compared against. State what changed and **why the previous
shape was wrong**. A commit message that says what a reader could get from the
diff has wasted itself.
