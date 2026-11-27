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

## A session note is written and never swept up

Every hook writes `session-<id>.json` into the state directory, and nothing
deletes it. `SessionEnd` was not observed firing in a headless run, so there is
no reliable event to delete on, and a machine accumulates one small file per
session forever — a few hundred bytes each, so this is untidiness rather than a
problem. Sessions a script runs leave nothing, which is what keeps it small: a
job classifying email would otherwise have left a note per message.

**Sweep notes untouched for a day, the first time the state directory is
annoying to read**, or fold it into whatever ends up rotating `log.txt`. A swept
note costs nothing: a session that started others reads a missing note as a
session not at work, and a day-old one stopped counting long before.

---

## The first turn after starting sessions still rings

A session learns which sessions it started from their reports, so the turn that
starts them ends before any report has named one, and it rings while they work.
The user has usually just typed that turn, so it is one sound at the keyboard per
launch rather than a ping to the phone. The link exists earlier: the first line of
a started session's transcript is `{"type":"derived-from","sessions":[{"id":
"<the starting session's Claude Code id>","via":"launch"}]}`, so a started
session could name its starter in its own note at its first prompt. That line is
not proof on its own — the session that built this rule carried one with
`via: "launch"` although the user typed its first prompt — so it would need the
brief (`Background (from the session that started this one):`) beside it, and
the starting session would have to look for notes naming it rather than read the
ones it knows.

**Close it the first time the launch sound is called noise**, by having a started
session write its starter into its note and the starter's turn end look for
notes that name it.

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

## The ping tool reads Claude Code's environment, which is not a contract

`mcp.ts` takes `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PROJECT_DIR` from the
environment Claude Code spawns it with — measured with a throwaway MCP server,
not documented anywhere. They are the only way a tool call can know which session
made it, since MCP itself hands a tool nothing but its arguments. If either
disappears, the tool keeps working and loses a property each: no session means
its pings are never held for a busy session, no project directory means the
prefix falls back to the server's working directory.

Both failures are silent and both fail safe, which is why this is a note rather
than a guard.

**Look here first if tool pings start arriving under the wrong project, or stop
being held while a session works.**

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

## The relay carries text, so a machine behind one cannot send a picture

`relay-protocol.ts` moves a ping as JSON with the message in it, and the picture
is bytes. A machine that forwards its pings — the one case where the sender
cannot reach Telegram itself — therefore refuses an attachment and says so in
the tool's answer, which is honest but is still a machine where the feature does
not exist. Carrying the bytes means either base64 in the body, which triples
them, or a second multipart route through the relay, which is a second thing to
authenticate.

**Do it the first time a picture is actually wanted from a machine behind a
relay.** Until then this is a feature nobody has missed on the machine that
lacks it, and `The picture did not go: this machine forwards its pings through a
relay` names its own absence.

---

## A ping with no project gets the machine label twice

`withMachineLabel` is idempotent for everything the product normally sends — a
prefix that already carries an `@` is left alone on a second pass. A ping that
arrived with **no** project at all is the exception: on a machine labelled
`proj` it becomes `[proj] …`, which reads as a project of that name, so the
flush's second pass turns it into `[proj@proj] …`. The message the queue holds
and the message that finally goes out then differ, and the repeat rule — which
compares them word for word — misses. Nothing here can tell a project genuinely
called `proj` from a machine labelled the same, which is why this is a wart
rather than a bug with a fix.

It needs a payload with no `cwd` to happen at all, and such a ping is already
worth investigating on its own: see the `finish-phase` skill, where a bare
`[<label>] просит разрешение: инструмент` is the sign that a payload never
arrived.

**Fix it by labelling once at the edge, rather than on every pass through
`deliver`, the first time a prefix repeating its own name — `[proj@proj]` —
appears in a real log.**

---

## The kinds of background work are known only from what has been seen

`willCarryOn` decides whether a turn end is real by matching `type` against
`subagent`, `shell` and `monitor`. Those three are every kind that has appeared
in a logged payload — the seventeen probes of August, and the `MONITOR` lines
since 24 November.
Claude Code's types now name more (`workflow`, `teammate`, `cloud session`,
`MCP task`) but say nothing about which of them return a turn, so a rename on
their side still turns ours into unknowns.

**The servers a shell is recognised by are a token list**, in
`domain/ping/endless-command.ts`. A server it lacks — `npx vite` with no
subcommand, `node server.js`, `python manage.py runserver` — holds its session's turn ends
until the thirty-minute net rings: late, not lost. Add one when the log shows
`SOUND turnEnded | the safety net` for a session that was running a server, and
add the commands that exit beside it in the spec first: every loosening so far
was caught matching a build. The `command` field has since been measured: the
first `ENDLESS not counted as work` lines in the real log carry it.

**A Monitor armed on a server's output rings at once where the app sends it as a
`shell`.** That shell carries its command, so `npm run dev | grep ready` under a
Monitor looks exactly like a background dev server, though the Monitor's deadline
would end it. Sent as a `monitor`, as it has been since 24 November, it is held
like any Monitor. The symptom is a false «закончил ход» next to an `ENDLESS` line whose
command pipes a server into `grep`. Count the fifth of Monitor calls that do not
follow a file before acting: if this shape is common, a pipe into `grep` may be
the tell.

**An artifact's subscription is told from the Monitor tool by its description
alone.** Neither carries a `server`: the four August payloads that caught the
subscription had only `id`, `type`, `status` and `live updates for artifact <url>
(auto-armed on publish)`, and every November sighting of the Monitor tool had the
agent's own description. The rule dismisses a `monitor` whose description begins
with that phrase or carries that parenthesis, and counts every other one as work.
No subscription has been logged since August, so whether the app still arms one,
and in which words, is unmeasured. **Look here if a session that published an
artifact rings only through the net** — `SOUND turnEnded | the safety net` after
every statement it ends on, with a `MONITOR` line naming the artifact: the
wording moved, and the phrase in `hook-ping.ts` follows it. The `MONITOR` line
stays for exactly this; it is how the November change was found in one read of
the log.

**A persistent Monitor is counted as work and never hands a turn back.** It
arrives like any Monitor, nothing in the payload tells it from one with a
deadline, and none of 1,231 measured Monitor calls was persistent, so the
net covers it. The symptom is `SOUND turnEnded | the safety net` in a session
that armed a session-long watch; the fix then needs a field from Claude Code, or
a note of when each task id was first seen.

The statuses are thinner still: every sighting said `running`, so the rule's
`status === RUNNING` clause has never been observed doing anything and is the
one reasoned guess left in it.

Failing that way is cheap by design — anything unjudged pings — so this is not
urgent. It is also not silent: on every hook event the log names whatever was
running and was neither counted as work nor deliberately dismissed, as
`BACKGROUND not counted as work | <type>/<status>`. That covers an unknown kind
*and* a known kind in an unmeasured status, which is the half that guesses. A
monitor never appears there; it is judged, not unknown, and has its own `MONITOR`
line.

**Add a kind when that line names one that should have held the ping** — a false
ping while an agent was plainly still working is the symptom, and the log line
under it is the evidence. Guessing at kinds nobody has observed is how the
counting rule got written in the first place.

---

## `deliver.spec.ts` runs the real domain functions it is supposed to mock

The `write-a-spec` skill says an edge spec mocks our own modules too, and names
this exact case: "`deliver.ts` is not tested by letting `decideDelivery` really
run — mock it, drive the funnel by what it returns." It never has. `deliver.spec`
lets `decideDelivery`, `attachmentFor` and now `worthAnotherTry` run for real,
and feeds them fixtures built with their own helpers.

The coverage is honest — every assertion would fail if either half broke — but
when the parser breaks, `deliver.spec` goes red beside `delivery.spec` and points
at the wrong file, which is the whole reason the rule exists. Two ways out, and
they are opposite: mock the domain in this one spec and lose the integration
truth, or admit in the skill that a pure, fast, deterministic domain function may
run live and only edges must be mocked.

**Decide it the next time this spec has to change for a reason that is not its
own** — that is when the misdirection costs something. It is a convention
question, so it belongs to whoever owns the conventions, not to whoever noticed.

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

## The limits describe whichever account the CLI signed in as, not the session's

`usage-api.ts` reads the token from `~/.claude/.credentials.json`, so the block
belongs to the account that last signed in *there*. The desktop app keeps its own
per-account auth elsewhere and leaves that file alone when the user switches
accounts: a switch from a home account to a work one at 17:10 left every ping for
the next two hours carrying the home account's windows, and carrying them
*fresh* — 98% frozen while its countdown ticked 3h20m → 2h46m, because the home
account had stopped spending while the work account spent. Nothing here can
notice. The age guard and the `WARN` line fire when a reading is old or missing,
never when it is current and about somebody else.

No exact fix is available. The credentials file holds one unnamed entry —
`claudeAiOauth`, carrying tokens, expiry, scopes and tier, and no account — and
the endpoint's answer names no account either. The app does know: its sessions
live under `%APPDATA%\Claude\claude-code-sessions\<account-id>\`, so a session id
resolves to an account uuid. But that uuid appears nowhere else readable, while
`claude auth status --json`, which does name the token's account, answers with an
email and an org id. Two identities that never meet.

So the diagnostic is a command rather than a line under the block, which was
built as a mock-up and rejected: an email is too much text for four rows of
numbers.

```bash
claude auth status --json
```

The workaround is to sign the CLI in as the account being worked on, with
`claude auth login`, which rewrites the file the product reads. It mirrors the
bug rather than curing it — pings from the other account's sessions then carry
these numbers instead — but it is one command, and the diagnostic above says
which way round it currently is.

**Pick it up when either identity becomes reachable from the other**: a hook
payload that names its account, or a `claude auth status` that reports the uuid
the app names its session folders with. Then the block can refuse to draw itself
and say why, which is what this product does everywhere else it cannot be sure.
Reading the app's own token store to fetch the right account's numbers is the
other route, and is not recommended: a private layout that changes with the app's
version, most likely encrypted per user, and the phase parked for depending on
the app's internals is already in `PLAN.md`.

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

---

## The two ends of a relay can disagree about markup, and only one half is guarded

A machine that cannot reach Telegram composes the whole message — escaping and
the quoted block included — and hands the finished string to a relay host, which
posts it. The two ends can be on different versions, and the two skews are not
symmetric.

**Old client, new host** was the dangerous one: raw text posted with
`parse_mode: HTML` gets a 400 the first time a model writes `<` or `&`, and the
ping is swallowed — the failure this product spends everything to avoid. That is
now closed rather than documented: the ping body carries `html: true`, and a host
sets `parse_mode` only when the client says the text is ready for it. An old
client sends no flag, so its text goes out plain and intact.

**New client, old host** is what remains: a host from before this change ignores
the flag and posts the markup as text, so the user reads `<blockquote>` in their
chat. A glance, not a loss, and it ends the moment the host is pulled.

**Delete this entry when the relay protocol grows a version handshake**, which is
the only thing that would let the far side know rather than assume.

