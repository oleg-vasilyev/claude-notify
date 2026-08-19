# claude-notify — what it does and why

This is the specification: behaviour, the delivery pipeline, the invariants,
and the design dead ends already paid for. How the code is written lives in
`CLAUDE.md`; how to install and run lives in `README.md`.

The dividing question is whether a fact would survive a rewrite in another
language. The Telegram Bot API's behaviour, the decision pipeline and the hook
events would — so they are here. The runtime's encodings and the file layout
would not — so they are not. That claim has been tested: the product was
rewritten from PowerShell to TypeScript and five lines of this document
changed.

## Purpose

Claude Code runs tasks that take hours. The user steps away; the turn ends with
a question or an approval request; the sound notification plays to an empty
room. Without a ping the agent idles until the user happens to return — the
product exists to close that gap, and only that gap.

The counter-requirement is equally hard: **while the user is at the keyboard,
Telegram stays silent.** They are already getting the sound; a phone buzzing
with things they can see on screen teaches them to mute the bot, which kills
the product.

## How a ping happens

Two sources, deliberately redundant:

1. **The model itself**, through a tool it is given: `ping_user`, served over MCP
   by `mcp.ts` and registered once per machine for every project. The agent
   passes one Russian line saying what is needed. This is the high-value path —
   the ping says *why* — but it is model behaviour, so it is probabilistic by
   nature.
2. **Hooks**, the mechanical fallback for turns where the model did not call:

| Event | Fires when | Message |
| --- | --- | --- |
| `Stop` | the turn ended; the ball is in the user's court | `закончил ход, ждёт тебя` |
| `PreToolUse` on `AskUserQuestion` | a question dialog opened mid-turn | `вопрос: <the question itself>` |
| `PreToolUse` on `ExitPlanMode` | a plan awaits approval mid-turn | `план готов, жду апрув` |
| `PermissionRequest` | a permission prompt is about to show | `просит разрешение: <tool>` |
| `Notification` | permission prompts and idle waiting, per the docs | never observed to fire — see tombstones |
| `UserPromptSubmit` | the user wrote into the session | nothing — it only records that work resumed |

The mid-turn events matter because `Stop` cannot see them: a question dialog or
a permission prompt suspends the turn without ending it. All four have now been
observed firing in the desktop app; `Notification` alone never has.

**The two answerable events do not take the same answer.** `PreToolUse` reads
`hookSpecificOutput.permissionDecision` with a reason beside it; `PermissionRequest`
reads a nested `hookSpecificOutput.decision.{allow, reason}` and honours nothing
else — not even exit code 2. Answering one in the other's shape is not an error:
the host ignores the output and the prompt goes on waiting, which is exactly how
this was found, by a permission answered «Разрешить» on the phone and still
standing on the screen. The shape is chosen by the event, never by the question.

**A hook says nothing for a session a script is running.** Claude Code is also an
API: a job that classifies email starts a real session per item, and each one
takes a prompt and ends its turn seconds later. The hooks fire exactly as they do
for a person, and «закончил ход, ждёт тебя» is then a lie — five of them arrived
from one such job in two hours before this was noticed. The payload cannot tell
the two apart, measured key by key; the hook process's own environment can, and
`CLAUDE_CODE_ENTRYPOINT` reads `sdk-cli` where a desktop session reads
`claude-desktop`.

Only the *mechanical* pings are suppressed. A script that calls `ping_user`
itself is still delivered, because deciding it needs a person is a judgement, and
whoever wrote the script made it deliberately — the same reason a model's own
ping was never rate-limited. And the rule fails safe in the usual direction: an
entrypoint this product has never heard of pings.

Hook pings pass `-RateLimitMinutes` so a burst collapses; deliberate model
pings pass none and are never rate-limited.

**The model is told what is needed and nothing else.** The `[project]` prefix is
derived from the working directory the session is in, never from what the model
typed, because a model asked to name its own project names the *product* rather
than the folder — measured, and wrong in every one of the 23 pings it had sent
from this checkout, which split one project's rate-limit stamps and queue
identity in two. The machine label and the limits line are added the same way,
downstream. What is left for the model is the only part it actually knows.

**And the tool answers back.** A ping used to be a shot in the dark: the command
exited 0 whether the message reached a phone or went into the queue. The tool
reports which — so an agent told "they are still at the keyboard, this is
queued" can carry on working instead of stopping to wait. Nothing else in the
product gives the model a fact about the user's presence, and it is deliberately
the *only* one: the tool description forbids the model from judging presence
itself, since a model that guesses "they are probably still here" swallows the
ping the whole product exists to send.

The cost is a resident process per open session, which is how MCP works. It is
kept honest by making it thin: the server holds no delivery logic and spawns
`notify.ts` per call, so an edit to the funnel takes effect on the next ping
rather than at the next restart. A resident process serving stale code is the
same trap as the stale config in the tombstones below, and this is the shape
that refuses it.

**`Stop` says nothing while background work is still running.** The event fires
every time the agent hands the turn back, including the hand-backs it makes
while a long task keeps going in the background — and «закончил ход, ждёт тебя»
is then a lie that costs a walk to the machine. The payload carries
`background_tasks`, and an empty array is what actually means the turn is
waiting on the user. Found by a real ping arriving during a build, not by a
test.

**`PreToolUse` and `PermissionRequest` both fire for `AskUserQuestion`, in the
same second.** Left alone that is two messages for one question and two hooks
waiting on one answer, so ownership is assigned rather than discovered:
`AskUserQuestion` belongs to `PreToolUse`, and `PermissionRequest` handles every
tool *except* it.

## Answering from the phone

When the user is away, a question does not merely get announced — it gets asked,
with a button per option and the recommended one starred. The hook then blocks
until an answer arrives or the window closes.

| | |
| --- | --- |
| What can be answered | a question with options, and a tool asking permission |
| How | tap a button, or reply in your own words |
| Who may answer | only the configured chat; anything else is ignored |
| If nobody answers | the question is handed back and appears in the app as before |
| While at the keyboard | nothing is asked at all — the app is the better place |

**A machine may refuse to quote.** `QUOTE_QUESTIONS=false` keeps the text of a
question on the machine that asked it: the ping says only that an answer is
wanted, and a question with options is never put on the phone at all — asking
one means sending it, so the two cannot be configured apart. A permission still
names its tool, which carries no work of its own. Everything else is unchanged,
and the setting is per machine, since `.env` is.

The case that earned it: a work laptop, whose project names are dull but whose
question text is not, feeding the same personal bot as a home machine that
quotes freely.

Two rules exist because a wrong answer is worse than a late one:

- **Words may only answer when exactly one question is waiting.** With two open,
  a bare "да" cannot be attributed, so it is refused rather than guessed.
- **A permission may only be pressed, never written.** "ну давай" is not a
  decision the product is willing to read as consent.

The answer reaches Claude as the hook's decision. For a question that is a
`deny` whose reason carries the user's words — the model treats the reason as
the answer and continues, and the reason says so in as many words, because a
bare denial invites it to simply ask again. For a permission it is the `allow`
or `deny` the button named.

Two processes are involved, because `getUpdates` tolerates one reader: the hook
writes the question to a file and waits, the watcher is the only one polling
Telegram, and it writes the answer back beside the question.

## Relaying from a machine that cannot reach Telegram

A work laptop sits behind a network that blocks Telegram outright, so the whole
product is unavailable there — and it is precisely the machine that runs the
long tasks you walk away from. Another of your machines, on the same network,
already reaches Telegram. It runs `npm run relay`, and the blocked machine
sends through it.

**Only the last step moves.** The project key, the machine label, presence, the
rate limit and the limits line are all decided on the machine the event
happened on, because every one of them is a fact about *that* machine and
*that* account — your idleness at the work laptop is the question worth asking
there, and the account whose windows are filling is the one working. What
crosses the network is the finished message and nothing else; the relay's only
decision is whether the caller may send at all.

**The token stays on the relay host.** A relayed machine holds a URL and a
shared secret, and that is deliberately less than a token: the worst a leaked
secret buys is the ability to write into one chat, never the bot itself. The
secret rides as a bearer header and is checked before the body is even parsed,
so a stranger who guesses the port learns nothing from a malformed request that
they would not have learned from a well-formed one. The URL and the secret are
one fact, not two, and are read as one: a machine that names a relay without the
secret to prove itself is treated as not configured at all, because every ping it
made would come back refused.

The traffic is plain HTTP over the local network, and stays that way on
purpose: what crosses is a line already judged fit to appear on a phone. That is
not an assumption but a composition — `QUOTE_QUESTIONS=false` on the sending
machine keeps a question's text off the wire by the same act that keeps it off
the phone, because the relay never sees anything the phone would not.

**A relayed machine is never asked a question**, only told about one. The answer
would have no way home: the return channel is `getUpdates`, which the blocked
machine cannot reach either, and inventing a second hop back would put a
question's answer through two failure points to save a walk. So the hook falls
straight through to a plain ping, exactly as it does when answering is switched
off.

The relay is the product's first resident process, and everything else here is
event-driven, so it needs an owner: setup writes a batch file into the Startup
folder that launches it minimised at login. **The Windows firewall blocks the
port until told otherwise**, and that is the one step that cannot be automated
without elevation — setup prints the `netsh` line rather than pretending. A
relay that never started and a relay that is running are indistinguishable from
the far machine until a ping is lost, which is why setup checks `/health`
before it will write a relay's URL into `.env`.

## The delivery pipeline

Every message, from either source, goes through the same funnel:

```
message
  1. project key  <- the [project] prefix, or "global"
  2. machine label: [proj] -> [proj@home]
  3. presence:  user active (idle < min_idle_minutes)?
       yes -> append to pending queue, ensure a watcher is running, stop
  4. rate limit: this project pinged within the window?
       yes -> drop, logged
  5. send — to Telegram, or to the relay that can;
     write the project's last-sent stamp
```

The order is the design. Presence outranks the rate limit because a suppressed
ping is *queued*, never lost; the rate limit drops, and may only drop the
generic fallback pings that have a better sibling.

**The queue.** Suppressed pings append to `pending.jsonl`, one JSON object per
line, each carrying the moment it was queued, the message, and the session it
came from. A single background watcher polls idleness every 30 seconds; once the
user has been away `min_idle_minutes`, it flushes: entries older than
`stale_minutes` are dropped, entries whose session is not waiting are **put
back**, and the rest are deduplicated to **one message per project, keeping the
longest** — so the model's contextual ping beats the hook's generic one — and
sent. The watcher then exits; it is spawned again by the next suppressed ping.
An 8-hour deadline bounds a watcher outliving an all-day session; by then every
entry is stale anyway.

**A queued ping describes a moment, and the moment can end before it is
delivered.** "Закончил ход, ждёт тебя" is queued because the user is at the
keyboard — and a user at the keyboard is exactly the one who answers, so the
agent goes back to work while the ping waits. Delivered ten minutes later it
sends somebody to a screen where nothing is waiting, which is worse than no ping
at all: the notifier is only worth having if arriving means arriving to
something.

`stale_minutes` cannot catch this. It was written for the opposite case — the
user sat through the ping, so they saw the screen — and its premise fails the
moment the user *acts*: the ping that started this rule was nine minutes old,
well inside a fifteen-minute window, and false for eight of them.

**And a ping you were present for is a ping you have already read.** The sound
plays and the screen changes the moment a turn ends; if the keyboard was touched
at any point *after* the ping was queued, the person doing the touching saw it
and chose what to do. Delivering it later tells them something they knew twenty
minutes ago and sends them to a laptop they deliberately closed — measured, and
the reason the rule exists: a turn ended at 19:55:41 with the user four seconds
from the keyboard, and the ping arrived at 20:01:52.

This needs no threshold and no setting. At flush time the last input is
`now − idle`, the ping remembers when it was queued, and the comparison is the
whole rule. It also says exactly what the queue is *for*: the only ping worth
holding is one raised inside `min_idle_minutes` of somebody leaving — the blind
spot where they had already gone but the presence probe had not noticed yet.
Everything else the queue used to deliver was this case.

**So the queue stops asking whether a ping was true when it was written, and
asks whether its session is waiting now.** That is the only question worth
asking at the moment of delivery, and the events that answer it are already
being logged:

| The session last did this | It is | A ping from it |
| --- | --- | --- |
| ended a turn (`Stop`) | waiting for the user | goes out |
| took a prompt (`UserPromptSubmit`) | working | waits its turn |
| hit a permission or a question | standing at a wall | goes out while the wall stands |

`UserPromptSubmit` exists only for this: it is the one registered event that
sends no ping, because "the user came back" is the fact that makes every other
ping from that session false.

**A ping whose session is busy is held, never dropped.** The agent may stop five
minutes later and still need somebody — so the entry goes back into the queue and
is judged again at the next flush, at most thirty seconds later. Only
`stale_minutes` ends that loop, which is what it was always for.

The held ping is not deduplicated against the `Stop` ping that follows it, and on
the main path it cannot be: with the user away, `Stop` sends immediately rather
than queueing, so the contextual ping arrives on the next flush as a second
message. Two messages a few seconds apart, one of which says what is actually
wanted, beats one that says «закончил ход» — and the alternative, holding the
generic ping back to see whether a better one is coming, would be guessing about
the future.

**A wall comes down without an event to say so.** Approving a permission
produces no hook; the tool simply runs. But the tool call it was blocking has an
id, the payload carries it, and the transcript records the answer against that
same id — so the flush reads the tail of the transcript and asks whether that
one call has been answered yet. Once it has, the user has already dealt with the
wall in the app and the ping stays home. This costs one read per flush rather
than a process per tool call, which is what registering `PostToolUse` would have
cost.

Everything here fails safe. A session nothing is known about, a ping carrying no
session, a transcript that cannot be read — all deliver, because a false ping
costs a glance and a swallowed one costs hours.

**The five seconds of silence it waits for are measured, not chosen.** The hook
fires at the end of a turn, and the transcript is still being written as it
does: across 46 real `Stop` events, four were followed by a write within
0.4–0.7 s, so "the file changed at all" would have dropped nearly one ping in
ten. The fastest a real reply ever arrived was 10.8 s. Five seconds sits between
the two with room on both sides, and the asymmetry is deliberate — the check
only ever refuses to fire, never fires wrongly, because the transcript's date is
the *last* write and a session that resumed keeps writing long past any window.

**Limits ride along with the message.** Before a send — never before a queue —
the current windows are read and appended, so a ping delivered from the queue
carries fresh numbers rather than the ones from when it was suppressed:

```
[a-project@home] Закончил фазу 2, жду апрув на миграцию БД

5-hour  ━━━━──────   35%
weekly  ━━━━━─────   54%
fable   ━━━───────   28%
```

**The limits are a block, not a sentence, and it is monospaced on purpose.**
Telegram renders ordinary text in a proportional font, where a row beginning
with a label puts every bar in a different place and three windows read as
rubble. Sending the block as `<pre>` buys back the column, and the grey slab
Telegram draws around it does a second job nobody designed: it separates the
numbers from the message above them, so the ping reads as a note with a readout
attached rather than as one long string.

That costs an HTML `parse_mode`, which this design refused for a long time and
was right to until it measured the price. The refusal was written against
MarkdownV2, where eighteen characters need escaping and a model writing a
plausible sentence will eventually hit one. HTML mode needs three — `&`, `<`,
`>` — and one function at the boundary escapes them for every message the
product sends. What it buys is a readout that lines up.

Two things the bar refuses to do, both so it cannot lie at the ends: it never
shows empty while anything at all has been spent, and never shows full until the
window really is. A rounded 97% drawn as a full bar would say *stop* at the
moment the honest answer is *nearly*.

The point is deciding whether coming back is worth it. A window under 80% shows
only its share; at or above 80% it also shows when it resets, because that is
the moment the number stops being trivia — `5-hour  ━━━━━━━━━─   92%  12m`
says wait, not hurry. Every window is drawn: showing only the busiest weekly meant the
second row changed identity between pings, and a row that is sometimes one
window and sometimes another is worse than a row more.

The labels are English although the ping above them is Russian, and that is not
an oversight. One of them is the endpoint's own word — a model's
`display_name`, lowercased — and translating that would mean maintaining a
Russian gloss of somebody else's vocabulary as it grows. The other two are ours,
chosen to sit beside it without looking foreign.

**A reading survives the token that fetched it.** The OAuth token lives eight
hours and this product never refreshes it — see invariant 8 — so between the
moment it expires and the moment Claude Code writes a new one, the endpoint
answers 401. That gap was measured at four hours on one afternoon, half the
token's life, and every ping in it arrived bare.

So the last reading that worked is kept, and shown with its age when a fresh one
cannot be had. A number with "40m old" under it is still worth reading; a number
silently four hours stale is a lie. **A row disappears once the reading is older
than a quarter of that row's own window** — 75 minutes for the five-hour, 42
hours for a weekly. The rule follows from what the rows mean rather than from a
taste for a number: a five-hour figure from four hours ago describes a window
that has almost entirely turned over, while a weekly one barely moved.

Refreshing the token here was rejected rather than skipped. Refresh tokens are
single-use, so a notifier racing the app to rotate one can invalidate the pair
and log the user out of their own editor — a far worse outcome than a missing
line, and one the user could not diagnose.

**The source is the account's own usage endpoint.** `GET /api/oauth/usage` with
the OAuth token Claude Code maintains — the same call the CLI's own usage
display makes. There is no alternative: the status line's payload carries
`context_window` and `exceeds_200k_tokens` but no limit windows, and no local
file holds consumption. Three properties make borrowing the token acceptable,
and all three are load-bearing: it is read at send time and never logged or
copied; the request is a GET to the token's own issuer; and it is never
refreshed, because refreshing is the CLI's job and racing it could break the
session that owns it. An expired token, a missing credential file or an
endpoint that changed all produce the same outcome — no second line, one
`WARN usage unavailable` in the log, and the ping itself unaffected. This is an
internal endpoint, not a public API, so that degradation is the design, not a
fallback.

**Presence** is the system-wide time since the last keystroke or mouse move
(win32 `GetLastInputInfo`) — activity in any application counts. Passively
watching a video therefore counts as absence after `min_idle_minutes`; for the
"waiting for the agent while watching YouTube" case that is a feature, and the
threshold is the knob if it ever is not.

## Invariants

1. **A deliberate ping is never rate-limited.** Only hook fallbacks pass a
   rate-limit window; the model's contextual pings always go through the
   presence filter and nothing else.
2. **Presence suppression never discards while the ping is still true.** It
   queues; a queued ping goes out only while its session is waiting, waits in
   the queue while that session works, and is discarded only by `stale_minutes`
   — logged, never silent.
3. **Rate-limit stamps are per project.** One project's ping must not silence
   another's fallback. Paid for once — see tombstones.
4. **At most one watcher.** A lock file holds the watcher's PID; a dead PID is
   taken over, a live one defers. The lock is removed on every exit path.
5. **The token exists only in `.env` on the installed machine.** The repository
   ignores it, `docs:check` fails if that ever stops being true, and the
   installer does not embed it — moving to a new machine means typing it again,
   by design. A machine sending through a relay never holds one at all.
6. **A broken presence probe counts as away.** If `GetLastInputInfo` fails the
   ping is sent rather than swallowed — a false ping costs a glance, a
   swallowed one costs hours.
7. **Every outcome is one log line** — `SENT`, `QUEUED`, `SKIP`, `DROP`,
   `ERROR`, `HOOK`, `WATCHER` — because the first real debugging session was
   blind without it.
8. **The OAuth token is read, never written, never logged, never refreshed.**
   It appears in exactly one function, lives in one local variable, and leaves
   the machine only as an `Authorization` header to its own issuer.
9. **Usage never fails a ping.** Every path through the usage reader returns
   nothing rather than throwing; the limits line is an enrichment, and the ping
   is the product.
10. **Only the configured chat can answer.** Every update is checked against
    `CHAT_ID` before it can decide anything, because an answer is an
    instruction to an agent and not merely a message.
11. **An unanswered question is handed back, never guessed.** The window closing
    leaves Claude Code exactly where it would have been without the bot.
12. **A question is forgotten on every exit path** — answered, timed out, or
    never delivered — so yesterday's answer cannot resolve today's question.

## What survives what

- **A reboot or power loss.** Hooks are configuration, not a process; the queue
  is a file; the watcher lock names a PID that no longer exists and is taken
  over. Nothing needs restarting except Claude Code itself.
- **Telegram unreachable.** The send fails, the failure is logged with the
  reason, exit code 1. There is no retry — see TECH-DEBT for the trigger. A
  question that cannot be delivered falls back to a plain ping, and a poll that
  fails leaves the watcher alive to try again: a dead poller and a quiet one
  look identical from the outside, which is the failure worth preventing.
- **A relay that is down, or refusing.** It fails exactly the way Telegram
  failing fails, and lands on the same line — the log names which of the two
  routes was taken, because a wrong secret and a blocked network need opposite
  fixes and look the same from the phone.
- **Two machines, one bot.** Stamps, queue and watcher are all per-machine
  state; the only shared resource is the chat itself, and the machine label
  keeps the streams readable. A relay adds a second shared thing — the host
  itself — which is why it decides nothing: it forwards, and every rule that
  could have gone wrong stayed on the machine that had the event.

## Tombstones — dead ends already paid for

- **The `Notification` hook never fires in the desktop app.** A full day of
  logging: six `SENT` from the model, zero `HOOK Notification` — while the
  documented behaviour (permission prompts, idle waits) was happening on
  screen. The fallback therefore rests on `Stop` + `PreToolUse` +
  `PermissionRequest`, and no design may assume `Notification` works.
- **Teaching the model to ping through a paragraph of prose.** For two months
  the model-initiated ping was a rule in the global `~/.claude/CLAUDE.md`
  carrying a shell command. It worked — 32 real pings in five days — but three
  things about it never could: the command embedded a machine path with an
  unquoted space, so every invocation depended on the model silently repairing
  it; a typo or a moved checkout produced *nothing at all*, no line in the log
  and no error; and no permission rule can name a shell command exactly, so it
  survived only because sessions happened to run in auto mode. A tool has one
  name, one schema, and a permission entry that matches it exactly.
- **A global rate limit silenced cross-project fallbacks.** One stamp file meant
  a ping from the project you were watching muted the safety net of the one you
  were not, for ten minutes — observed live on day one, hence invariant 3.
- **The first missing-ping mystery was the presence filter working as
  designed.** A question at 22:17 pinged at 22:28: the model's call was
  suppressed while the user was still at the keyboard, and the delivery
  happened on the next hook firing. The queue-plus-watcher exists so the delay
  is "a minute after you leave", not "whenever the next event fires".
- **"The power outage restarted everything" is false on a laptop.** The battery
  carried the sessions through; the stale config kept running. Reload is only
  ever explicit — restart the app, `--continue` in a terminal.
- **A hook payload is UTF-8, and a runtime that guesses otherwise mangles the
  one thing worth sending.** The first live question ping said
  `вопрос: ╨Ü╨░╨║╨╕╨╝…`. The tests had not caught it because they fed the hook a
  string built inside the test rather than the bytes a real caller writes: a
  test of an encoding boundary has to cross that boundary the way the caller
  does.
- **Identifying your own configuration by a substring of its path is not
  identifying it.** The installer recognised its own hook entries by looking for
  the product name in the command path, which silently stopped matching when the
  checkout was named something else — so a second run added duplicates instead of
  replacing. The specs passed because their fixture path happened to contain the
  name. An entry now carries an explicit marker argument, and moving the
  checkout is covered by a spec.

## Telegram Bot API facts this design leans on

- `sendMessage` is one POST; the body is JSON, UTF-8, and `parse_mode: HTML`.
  Three characters carry meaning there, so every message crosses one function
  that escapes them; nothing else in the product may build wire text.
- **`getUpdates` has one consumer per token.** Two pollers split the stream
  randomly, so exactly one process listens: the watcher. Hooks never poll — they
  wait on a file. `offset` is remembered on disk so a press is never read twice.
- **A hook may block for as long as its `timeout` says.** Measured, not assumed:
  a hook configured for 900 seconds ran all 900 and was killed on the second,
  which is what makes waiting for a human viable at all.
- **An inline keyboard's `callback_data` is the correlation.** It carries the
  question id and the option, which is how a press finds the hook waiting for
  it among several.
- A bot cannot message a user first; `/start` from the user is what creates the
  chat and makes its id visible in `getUpdates`.

## Roadmap

Phases 0-3 — sound, Telegram with presence filtering, the installer, and the
limits line — are what this document describes; they are done, and the product
has since been rewritten from PowerShell to TypeScript with no change in
behaviour. The rewrite bought what the old runtime could not offer at any
price: types, a layering rule the build enforces, and mutation testing.

**Phase 4 — answering from the phone** — done; it is the section above. Both
guesses made when it was a sketch turned out right: the answer does ride back as
a deny decision carrying the user's words, and correlation does ride in
`callback_data`. The choice left open — a blocking hook that polls, or a
resident poller talking to hooks through files — resolved to the second, because
the first would have put every waiting hook in the single `getUpdates` slot.

**Phase 4.5 — the relay** — done; it is the section above. It was sized as the
first thing here to need a resident process and turned out to need nothing else
new: the delivery funnel already ended in a single send, so the whole feature is
a discriminated union at that one step, plus a server that decides nothing.

**Phase 3.5 — restarting a loop after the limit resets** — investigated and
parked. Detecting the reset is solved (`five_hour.resets_at`) and resuming a
conversation works (`claude -r`), but everything that writes into a live session
from outside collides with the desktop app: its view hydrates only when it loads
a session, and typing into a stale window forks the conversation so the outside
work is silently dropped. Picking it up again starts with deciding whether a
loop may live in an app session at all, not with code.

**Phase 5 — TBD: task intake.** `/idea` in the bot lands a ticket on a board;
a headless `claude -p` run picks it up. This is a different product (a
dispatcher, not a notifier) and now inherits phase 4's watcher as its poller.

## Out of scope

- **Detecting presence by audio playback.** Watching a video without touching
  anything reads as absence; the `min_idle_minutes` knob is the accepted
  answer. Reconsider only if a real ping-during-video annoys in practice.
- **Anything but Windows.** Presence is win32 `GetLastInputInfo` and the sound
  hook is a PowerShell one-liner in `settings.json`. A macOS port is two files
  in `edges/` — the domain and this document already carry over, which the
  rewrite from PowerShell demonstrated.
- **Multiple users or chats.** One person, their machines, one bot.
