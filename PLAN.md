# claude-notify — what it does and why

This is the specification: behaviour, the delivery pipeline, the invariants,
and the design dead ends already paid for. How the code is written lives in
`CLAUDE.md`; how to install and run lives in `README.md`.

The dividing question is whether a fact would survive a rewrite in another
language. The Telegram Bot API's behaviour, the decision pipeline and the hook
events would — so they are here. PowerShell encodings and file layout would not
— so they are not.

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
   `notify.ps1` with a short Russian message naming the project and what is
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

## The delivery pipeline

Every message, from either source, goes through the same funnel in
`notify.ps1`:

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
the current windows are read and appended as a second line, so a ping delivered
from the queue carries fresh numbers rather than the ones from when it was
suppressed:

```
[job-finder@home] Закончил фазу 2, жду апрув на миграцию БД
5ч 35% · нед/Fable 54%
```

The point is deciding whether coming back is worth it. A window under 80% shows
only its percentage; at or above 80% it also shows when it resets, because that
is the moment the number stops being trivia — `5ч 92% (сброс через 12 мин)`
says wait, not hurry. Of several weekly windows the highest is shown, named
after the model it is scoped to, since that is the one that will actually stop
the work.

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
5. **The token exists only in `config.json` on the installed machine.** The
   repository ignores it and the installer does not embed it — moving to a new
   machine means typing it again, by design.
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

## What survives what

- **A reboot or power loss.** Hooks are configuration, not a process; the queue
  is a file; the watcher lock names a PID that no longer exists and is taken
  over. Nothing needs restarting except Claude Code itself.
- **Telegram unreachable.** The send fails, the failure is logged with the
  reason, exit code 1. There is no retry — see TECH-DEBT for the trigger.
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
- **A hook payload is UTF-8 and was being read as the console code page.** The
  first live question ping said `вопрос: ╨Ü╨░╨║╨╕╨╝…`. Pipe-tests had not caught
  it because they were driven from a PowerShell string rather than raw bytes —
  a test of an encoding boundary has to cross the boundary the same way the
  real caller does.

## Telegram Bot API facts this design leans on

- `sendMessage` is one POST; the body is JSON, UTF-8. Messages are sent as
  plain text with no `parse_mode`, so a hook payload or a question text cannot
  break markup — nothing needs escaping.
- **`getUpdates` has one consumer per token.** Two pollers split the stream
  randomly. Today the installer polls only during setup (to resolve `chat_id`),
  so the constraint is dormant — but it is the constraint that shapes phase 4:
  anything that *listens* must either be the single resident poller or not
  poll at all.
- A bot cannot message a user first; `/start` from the user is what creates the
  chat and makes its id visible in `getUpdates`.

## Roadmap

Phases 0-3 — sound, Telegram with presence filtering, the single-file
installer, and the limits line — are what this document describes; they are
done.

**Phase 4 — answering from the phone.** An inline button under a question
ping: «делай как рекомендуешь». Two hard sub-problems, named now so the phase
starts honest: *receiving* the tap collides with the single-`getUpdates`
consumer rule — either a blocking hook polls while it waits (simple, but holds
the turn and the polling slot) or a resident bridge process becomes the one
poller and hooks talk to it through files; and *delivering* the answer into the
session — the candidate mechanism is the `AskUserQuestion` hook returning a
deny decision whose reason carries the user's words, which the model then acts
on. Correlation between a tap and a waiting session rides in `callback_data`.

**Phase 5 — TBD: task intake.** `/idea` in the bot lands a ticket on a board;
a headless `claude -p` run picks it up. This is a different product (a
dispatcher, not a notifier) and inherits phase 4's bridge; it stays a sketch
until phase 4 exists.

## Out of scope

- **Detecting presence by audio playback.** Watching a video without touching
  anything reads as absence; the `min_idle_minutes` knob is the accepted
  answer. Reconsider only if a real ping-during-video annoys in practice.
- **Anything but Windows.** Presence is win32, sound is `Media.SoundPlayer`,
  the runtime is PowerShell 5.1. A macOS port is a rewrite of the edges around
  the same core and the same PLAN.
- **Multiple users or chats.** One person, their machines, one bot.
