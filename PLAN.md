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

1. **The model itself.** A rule in the global `~/.claude/CLAUDE.md` (installed
   by setup) tells the agent: before ending a turn that waits on the user, call
   `notify.ts` with a short Russian message naming the project and what is
   needed. This is the high-value path — the ping says *why* — but it is model
   behaviour, so it is probabilistic by nature.
2. **Hooks**, the mechanical fallback for turns where the model did not call:

| Event | Fires when | Message |
| --- | --- | --- |
| `Stop` | the turn ended; the ball is in the user's court | `закончил ход, ждёт тебя` |
| `PreToolUse` on `AskUserQuestion` | a question dialog opened mid-turn | `вопрос: <the question itself>` |
| `PreToolUse` on `ExitPlanMode` | a plan awaits approval mid-turn | `план готов, жду апрув` |
| `PermissionRequest` | a permission prompt is about to show | `просит разрешение: <tool>` |
| `Notification` | permission prompts and idle waiting, per the docs | never observed to fire — see tombstones |

The mid-turn events matter because `Stop` cannot see them: a question dialog or
a permission prompt suspends the turn without ending it. All four have now been
observed firing in the desktop app; `Notification` alone never has.

Hook pings pass `-RateLimitMinutes` so a burst collapses; deliberate model
pings pass none and are never rate-limited.

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
  5. send; write the project's last-sent stamp
```

The order is the design. Presence outranks the rate limit because a suppressed
ping is *queued*, never lost; the rate limit drops, and may only drop the
generic fallback pings that have a better sibling.

**The queue.** Suppressed pings append to `pending.txt` as
`<iso-timestamp>|<message>`. A single background watcher polls idleness every
30 seconds; once the user has been away `min_idle_minutes`, it flushes: entries
older than `stale_minutes` are dropped (the user sat through them — they saw
the screen), the rest are deduplicated to **one message per project, keeping
the longest** — so the model's contextual ping beats the hook's generic one —
and sent. The watcher then exits; it is spawned again by the next suppressed
ping. An 8-hour deadline bounds a watcher outliving an all-day session; by then
every entry is stale anyway.

**Limits ride along with the message.** Before a send — never before a queue —
the current windows are read and appended, so a ping delivered from the queue
carries fresh numbers rather than the ones from when it was suppressed:

```
[job-finder@home] Закончил фазу 2, жду апрув на миграцию БД

▰▰▰▱▱▱▱▱▱▱ 35% · 5 часов
▰▰▰▰▰▱▱▱▱▱ 54% · неделя/Fable
```

**The bar starts the line, and that is the whole trick.** Telegram renders with
a proportional font, so a line beginning with a label (`5ч` against `нед`) puts
the bars at different places and the pair reads as ragged. Beginning with the
bar costs nothing and aligns them exactly, without `parse_mode` and the
escaping it would drag in.

Two things the bar refuses to do, both so it cannot lie at the ends: it never
shows empty while anything at all has been spent, and never shows full until the
window really is. A rounded 97% drawn as a full bar would say *stop* at the
moment the honest answer is *nearly*.

The point is deciding whether coming back is worth it. A window under 80% shows
only its share; at or above 80% it also shows when it resets, because that is
the moment the number stops being trivia — `▰▰▰▰▰▰▰▰▰▱ 92% · 5 часов · сброс
через 12 мин` says wait, not hurry. Of several weekly windows the highest is
shown, named after the model it is scoped to, since that is the one that will
actually stop the work.

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
2. **Presence suppression never discards.** It queues, and the only thing that
   discards a queued ping is staleness — logged, never silent.
3. **Rate-limit stamps are per project.** One project's ping must not silence
   another's fallback. Paid for once — see tombstones.
4. **At most one watcher.** A lock file holds the watcher's PID; a dead PID is
   taken over, a live one defers. The lock is removed on every exit path.
5. **The token exists only in `.env` on the installed machine.** The repository
   ignores it, `docs:check` fails if that ever stops being true, and the
   installer does not embed it — moving to a new machine means typing it again,
   by design.
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
- **Two machines, one bot.** Stamps, queue and watcher are all per-machine
  state; the only shared resource is the chat itself, and the machine label
  keeps the streams readable.

## Tombstones — dead ends already paid for

- **The `Notification` hook never fires in the desktop app.** A full day of
  logging: six `SENT` from the model, zero `HOOK Notification` — while the
  documented behaviour (permission prompts, idle waits) was happening on
  screen. The fallback therefore rests on `Stop` + `PreToolUse` +
  `PermissionRequest`, and no design may assume `Notification` works.
- **A global rate limit silenced cross-project fallbacks.** One stamp file
  meant a job-finder ping muted FoolProof's safety net for ten minutes —
  observed live on day one, hence invariant 3.
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

- `sendMessage` is one POST; the body is JSON, UTF-8. Messages are sent as
  plain text with no `parse_mode`, so a hook payload or a question text cannot
  break markup — nothing needs escaping.
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
