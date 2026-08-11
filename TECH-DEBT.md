# claude-notify — what is owed

Work finished enough to stop, but not finished. An entry names a **trigger**,
not a wish — without one it is a note that will still be here in a year. Delete
an entry when its trigger fires and the work is done; the git history
remembers.

---

## Three domain files carry almost every surviving mutant

The total was 88.8% against a break threshold of 85. Two phases running, every
new file has arrived at 96–100% and pushed the number up, so the old fear — that
the next `domain/` file would break the gate on its own — can be retired. The
survivors stay concentrated in the three files that were already lagging and
that neither phase touched: `memory-rule.ts` (67%), `env-file.ts` (81%),
`delivery.ts` (81%). Mostly boundary and string mutants, where a test asserts
*that* something happened rather than exactly what.

The relay paid its own way here, and the method is worth repeating: the three
survivors it produced were not gaps in the tests but a `catch` broad enough to
swallow the difference. Narrowing it to the one thing that can really fail —
`JSON.parse` — killed two of them and left better code behind.

**Kill survivors in whichever of those three a phase touches, before adding
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

## Only a finished turn's ping is checked against its session

The rule that a queued ping must still be true — see `PLAN.md` — reaches `Stop`
pings and nothing else. Two kinds are left out, for different reasons.

**The model's own pings.** `ping_user` reaches `deliver` through `notify.ts`, and
neither knows which session called: MCP hands a tool a message, not a transcript.
These are the pings with the most to say, and the tool's own advice makes the gap
sharper — it tells the model to carry on rather than wait, so the ping most
likely to be overtaken by its own author is the one nothing can drop. The
transcript is guessable: the server runs in the project's directory, and Claude
Code keeps one folder of transcripts per project, so the most recently written
would be right whenever a project has one session open and wrong whenever it has
two. MCP's own answer is better — a tool call carries no session, but the client
declares `roots`, and a future protocol revision may carry more.

**Mid-turn pings** — a permission wall, a question the app is holding. Their
transcripts move while the wait is genuinely open, so the rule as measured would
drop true pings. Deciding these needs a signal that a transcript's date is not:
whether the *last* entry is the one that raised the wall.

**Pick either up when a ping of that kind is seen arriving after its session
moved on** — the model's, if `--transcript` can be passed by the caller instead
of inferred; the mid-turn ones, only with a measurement of their own.

---

## A machine can end up with both ping channels at once

Setup retires the memory rule only when it managed to register the tool, so a
machine without the `claude` CLI keeps the old shell-command rule. The reverse
case is not handled: a machine where an earlier run registered the tool, and a
later run cannot reach the CLI — a broken PATH, a CLI mid-upgrade — puts the rule
back while Claude Code's own config still holds the registration. The model then
has two ways to say one thing, and deliberate pings are never rate-limited, so a
single wait can buzz the phone twice.

Nothing checks whether the tool is *already* registered, because the only honest
check is asking the CLI that is by hypothesis missing.

**Fix it the first time a wait produces two pings**, by reading Claude Code's
config directly rather than asking the CLI.

---

## The ping tool trusts its own working directory to name the project

`mcp.ts` derives the `[project]` prefix from `process.cwd()`, because Claude Code
spawns an MCP server in the directory of the session that owns it. That is
observed behaviour, not a documented promise. If it ever changes — a server
shared between sessions, a spawn from the user's home directory — every ping
from every project would be filed under one wrong name, and the only symptom is
a prefix nobody reads carefully.

MCP has the authoritative answer already: the client can declare `roots`, and a
server may ask for them. It is not used here because one source of truth beats
two, and the simpler one works today.

**Ask for the roots the first time a ping arrives under a project the session
was not in.**

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

`deliver.spec.ts` mocks six edge modules with inline `vi.fn()` factories, where
the reference project would keep a `*.stub.ts` beside each mockable module,
because a hand-rolled fake keeps compiling after the real signature changes.

That trigger has now fired. `state/config.ts` grew a `DELIVERY` table, and three
specs replacing the whole module with `{ readConfig: vi.fn() }` handed the code
under test an `undefined` — thirty-two failures whose stack pointed at the
production line rather than at the fake. The fix was smaller than stubs and
covers the whole class: those mocks now spread `importOriginal()` and override
only the function they mean to.

**Mock a module partially, never wholly.** Write the stubs the first time that
stops being enough.

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

## One e2e scenario in a whole-suite run hangs, and it is never the same one

Two sightings so far. The first was `takes the keyboard away when nobody
answered either`, in the answering file. The second was `never puts buttons on a
question from a relayed machine`, in the relay file — which hung its full
120-second timeout in `npm run e2e`, then passed 7/7 in 3 seconds when its file
was run alone, and the whole suite passed 19/19 on the very next run.

The second sighting kills the first one's suspects. That scenario has no
`closeQuestion` and no watcher — `ASK_MINUTES=0` on the machine it uses — so
neither "a watcher from an earlier case" nor "a swallowed `closeQuestion`
failure" can explain it. What the two share is only this: a hook process that
never returned, in a run where another e2e file had already spawned and torn
down processes. `fileParallelism` is off, so it is not two files racing; the
suspect is now something left running between files — a detached process, or a
port not yet released — rather than anything inside either scenario.

**Chase it the next time it hangs**, and keep the run whole: both files' logs,
plus a process list taken while it is still stuck. A gate that is right four
times in five teaches people to re-run it, which is worse than not having it.

---

## Nothing restarts a relay that died

The relay is the only process here meant to outlive the event that started it,
and the only thing that starts it is a login. If it crashes at eleven in the
morning, it stays down until the machine is logged into again, and the machine
depending on it learns only through `ERROR send failed` in a log nobody is
reading — which is the exact failure the watcher's design already refuses to
allow for polling.

The honest fix is the one Windows already has: a scheduled task with
`/sc onlogon` and a restart policy, instead of a batch file in the Startup
folder. It needs elevation to register, which is why setup does not do it today.

**Do it the first time a relay is found dead**, or the first time a ping is lost
because it was.

---

## There is no uninstaller

Setup adds hook entries, a config directory, a `CLAUDE.md` section, and — on a
relay host — a batch file in the Startup folder; removing them is a by-hand
exercise. The installer already knows how to find its own hook entries, so
`--uninstall` is mostly written.

**Write it the first time the hooks actually need to come off a machine.**

---

## Not debt, deliberately

- **The hooks point at the checkout rather than at a copy.** One place to edit,
  one place to update, and `git pull` is the upgrade. The price is that moving
  the checkout means running setup again, which is one command and is stated in
  `README.md`.
- **The token lives in `.env` in the checkout**, gitignored, with `docs:check`
  failing if that ever stops being true — the one gate that guards a secret.
- **Hook scripts log their whole payload (truncated).** Verbose, but the
  payloads are the only documentation of what Claude Code actually sends each
  event, and they have already falsified the documentation once.
- **The entry points and the third-party seams are outside coverage.** They hold
  no decisions; a unit that mocks `fetch` to watch `fetch` be called proves
  nothing. What they do is proven by sending a real ping.
- **`koffi` is a dependency with a native binary.** It ships prebuilt, so
  `npm install` needs no compiler, and it buys a presence probe that costs
  microseconds instead of spawning a shell every 30 seconds while a ping waits.
