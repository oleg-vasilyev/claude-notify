# claude-notify — what is owed

Work finished enough to stop, but not finished. An entry names a **trigger**,
not a wish — without one it is a note that will still be here in a year. Delete
an entry when its trigger fires and the work is done; the git history
remembers.

---

## Four domain files carry almost every surviving mutant

The total is 86.7% against a break threshold of 85, up from 85.1% before phase
4 — the four new files came in at 86–100%, so the fear recorded here last time,
that the next `domain/` file would break the gate on its own, was wrong. The
survivors are concentrated in the files that were already lagging and that
phase 4 never touched: `memory-rule.ts` (67%), `env-file.ts` (80%),
`delivery.ts` (81%), `usage.ts` (84%). Mostly boundary and string mutants, where
a test asserts *that* something happened rather than exactly what.

**Kill survivors in whichever of those four a phase touches, before adding
anything to it** — the report is at `reports/mutation/` and needs no re-run to
read, since the json reporter is configured.

---

## The recommended option is found by looking for a word

`AskUserQuestion` has no field saying which option is recommended — the
convention is a `(Рекомендую)` or `(Recommended)` note inside the option's
description, so `question.ts` finds the star by substring. Write `— советую`
instead one day and the star silently stops appearing. Nothing fails, nothing
is logged; the phone just shows three equal options.

**Fix it if the payload ever grows a real field for this, or the first time a
question arrives on the phone with no star where one was meant.** Matching more
spellings is not the fix — that is the same guess with more branches.

## A failed send is lost

`deliver.ts` logs `ERROR send failed`, sets a non-zero exit code, and drops the
ping. A flaky moment at the exact second of a send loses it, and the fallback
hooks may be rate-limited when the next event fires. The honest fix is to
re-queue the message with its original timestamp so the watcher retries it,
reusing the staleness rule as the give-up rule.

**Pick it up when `ERROR send failed` appears in a real log.**

---

## `hook-notification.ts` ships although its event has never fired

A full day of real use produced zero `HOOK Notification` lines in the desktop
app (see the tombstone in `PLAN.md`). The hook stays registered because it is
harmless and the event is documented to cover permission prompts and idle
waits — in some other host it may simply work.

**Delete the registration if a month of terminal-CLI sessions also never logs
`HOOK Notification`; delete this entry the first time one appears.**

---

## Mocked modules have no stub files

`deliver.spec.ts` mocks six edge modules with inline `vi.fn()` factories. The
reference project insists on a `*.stub.ts` beside each mockable module, because
a hand-rolled fake keeps compiling after the real signature changes.

**Write the stubs when a second spec mocks the same module**, or the first time
a factory is caught disagreeing with a real signature.

---

## `log.txt` grows forever

Every decision appends; nothing rotates. Payloads are truncated to 400
characters, which was the whole weight when the log reached 180 KB on its first
day, so the honest rate is unknown again.

**Rotate, or truncate to the last N lines on watcher start, when a real
`log.txt` passes 1 MB.**

---

## The usage snapshot is fetched per ping, with no cache

Every send makes its own `GET /api/oauth/usage`. Pings are rare enough that
this is a handful of calls an hour, and a cache would have to reason about
staleness against a number whose whole value is being current.

**Add a short-lived cache when a queue flush delivers several pings at once
often enough to notice**, or if the endpoint starts rate-limiting.

---

## A machine using Windows Credential Manager gets no limits line

`usage-api.ts` reads `~/.claude/.credentials.json`. Claude Code can instead keep
the token in Windows Credential Manager, in which case the file is absent and
every ping is missing its second line — correct behaviour, but visible only as
one `WARN usage unavailable` per send.

**Read the credential manager too when a machine actually turns up without the
file.**

---

## There is no uninstaller

Setup adds hook entries, a config directory and a `CLAUDE.md` section; removing
them is a by-hand exercise. The installer already knows how to find its own hook
entries, so `--uninstall` is mostly written.

**Write it the first time the hooks actually need to come off a machine.**

---

## Not debt, deliberately

- **The hooks point at the checkout rather than at a copy.** One place to edit,
  one place to update, and `git pull` is the upgrade. The price is that moving
  the checkout means running setup again, which is one command and is stated in
  `README.md`.
- **The token lives outside the repository**, in `~/.claude/claude-notify/`, so
  no `.gitignore` mistake can publish it and an update cannot overwrite it.
- **Hook scripts log their whole payload (truncated).** Verbose, but the
  payloads are the only documentation of what Claude Code actually sends each
  event, and they have already falsified the documentation once.
- **The entry points and the third-party seams are outside coverage.** They hold
  no decisions; a unit that mocks `fetch` to watch `fetch` be called proves
  nothing. What they do is proven by sending a real ping.
- **`koffi` is a dependency with a native binary.** It ships prebuilt, so
  `npm install` needs no compiler, and it buys a presence probe that costs
  microseconds instead of spawning a shell every 30 seconds while a ping waits.
