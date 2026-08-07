# claude-notify

Telegram pings from [Claude Code](https://claude.com/claude-code) when the agent
is waiting on you — but only once you have actually stepped away from the machine.

The problem it solves: an agent works for hours, you walk away, the turn ends
with a question, the sound notification plays to an empty room — and the agent
sits idle until you happen to come back.

```
[job-finder@home] Закончил фазу 2, жду апрув на миграцию БД
5ч 35% · нед/Fable 54%
```

A ping carries the project, the machine it came from, what is needed, and where
your limit windows stand — so you can tell whether coming back is even worth
it. While you are at the keyboard nothing is sent: the sound is enough, and the
ping waits in a queue until you actually leave. [PLAN.md](PLAN.md) explains the
machinery and why it is shaped this way.

## Installing

Windows, and Node 24 or newer. There is no build step — Node runs the
TypeScript directly.

1. Create a bot: open **@BotFather** in Telegram → `/newbot` → keep the token.
2. Write `/start` to your new bot (a bot cannot message you first).
3. Clone this repository wherever you keep your projects, then:

```bash
npm install && npm run setup
```

Setup asks for the token and a machine label, writes them to **`.env`** in the
checkout, resolves your chat id, registers the Claude Code hooks (Telegram and
sound), adds the ping rule to the global `~/.claude/CLAUDE.md`, and sends a test
message. The hooks point at this checkout, so keep it where it is — moving it
means running setup again.

4. Restart Claude Code so the hooks load.

`.env` is gitignored and `.env.example` is the shareable copy that lists every
key. You can edit `.env` by hand at any time; setup keeps whatever comments you
put in it.

Run setup again any time to update; it rewrites only its own hook entries and
leaves the rest of `settings.json` alone. For a second machine, or a rerun with
no questions:

```bash
npm run setup -- --token 123:ABC --label work
```

## Configuration

**`.env`** in this checkout, written by setup and safe to edit by hand:

| Key | Meaning |
| --- | --- |
| `BOT_TOKEN` | the bot token from BotFather |
| `CHAT_ID` | your chat with the bot, resolved automatically |
| `MACHINE_LABEL` | the machine name in pings: `[job-finder@work]` |
| `MIN_IDLE_MINUTES` | minutes without keyboard or mouse that count as "away" (default 3) |
| `STALE_MINUTES` | minutes after which a queued ping expires undelivered (default 15) |
| `INCLUDE_USAGE` | append the limits line to each ping (default true) |

One bot serves any number of machines; the label is what tells their pings
apart. Running state — the log, the queue, the per-project stamps — lives in
`~/.claude/claude-notify/`, away from the code.

## When a ping does not arrive

Everything the notifier decides is one line in
`~/.claude/claude-notify/log.txt`:

| Line | Meaning |
| --- | --- |
| `SENT` | delivered |
| `QUEUED idle=Ns` | you were at the keyboard; the watcher delivers it once you leave |
| `DROP stale` | it sat queued longer than `stale_minutes` — you were here all along |
| `SKIP rate-limit [proj]` | that project pinged too recently |
| `HOOK <event>` | a Claude Code hook fired, with its payload |
| `WARN usage unavailable` | the limits line was skipped; the ping itself went out |
| `ERROR send failed` | the Telegram API refused — the reason follows |

No line at all means nothing called it: the model did not ping and no hook
fired. To prove the pipe end to end, bypassing the presence filter:

```bash
node src/notify.ts --message "[test] проверка" --now
```

## Development

```
src/domain/     every decision, pure — no files, no network, no clock
  answer.ts         which Telegram update answers which question
  asking.ts         ask on the phone, or leave it to the app
  copy.ts           every Russian string the user reads
  delivery.ts       send, queue, or skip
  duration.ts       "1 ч 12 мин"
  env-file.ts       reading and updating .env without losing your comments
  hook-answer.ts    the answer, shaped as a decision Claude Code accepts
  hook-ping.ts      what each Claude Code event has to say
  hook-registration.ts  merging into settings.json without clobbering it
  memory-rule.ts    the rule setup writes into the global CLAUDE.md
  pending.ts        which queued pings survive, and which one wins per project
  project.ts        the project key and the machine label
  question.ts       a hook payload turned into something answerable by phone
  usage.ts          the limits line
src/state/      what this product remembers between runs
  asked-question.ts the question a hook waits on, and the answer it waits for
  config.ts         the settings, read from .env
  file-locations.ts every path it reads or writes, ours and Claude Code's
  last-sent.ts      one stamp per project, for the rate limit
  log.ts            the one log file every decision lands in
  pending-queue.ts  pings held back while you were at the keyboard
  update-offset.ts  how far the watcher has read Telegram
  watcher-lock.ts   who is delivering the queue right now
src/presence/idle-time.ts   how long since you touched anything (win32 via koffi)
src/telegram/telegram-api.ts sending a message, and what setup needs to find you
src/usage/usage-api.ts       the account's own limit windows
src/deliver.ts          the funnel every ping goes through
src/ask.ts              the funnel a question goes through, and waits in
src/answering.ts        reading Telegram for answers, for the watcher
src/watcher-process.ts  is a watcher running, and starting one that outlives us
src/hook.ts     entry point: one Claude Code event
src/notify.ts   entry point: one ping, from the model or by hand
src/watcher.ts  entry point: delivers what presence held back, and collects answers
src/setup.ts    entry point: the installer
```

```bash
npm run check            # lint, types, docs, tests — the gate to keep at zero
npm run test:coverage    # floor 80%
npm run test:mutation    # Stryker over domain/, breaks below 85%
npm run e2e              # the real hook process against a fake Telegram
```

`e2e/` is not part of `check` on purpose: it spawns real processes and waits out
real timeouts, so it is a release gate next to coverage and mutation rather than
something to pay for on every edit.

`.claude/` carries the conventions as tooling rather than as advice: a
`PostToolUse` hook lints each file the moment it is written, `phase-reviewer`
reviews a whole phase against `CLAUDE.md`, and four skills hold the procedures
that would otherwise bloat it — `add-a-hook-event`, `write-a-spec`,
`write-a-doc`, `finish-phase` (plus `retrospective`, which it runs last).

`domain/` may not import `node:*`, `koffi` or anything impure, and ESLint fails
the build if it does. [CLAUDE.md](CLAUDE.md) has the rest.

## The other three documents

- **[PLAN.md](PLAN.md)** — what the notifier does and why: the two sources of a
  ping, the delivery pipeline, the invariants, and the dead ends already paid
  for. Read it before changing behaviour.
- **[CLAUDE.md](CLAUDE.md)** — how the code here is written: the two layers, the
  lint zone between them, and the gates. Read it before writing code.
- **[TECH-DEBT.md](TECH-DEBT.md)** — what is deliberately unfinished, each entry
  with the trigger that would make it worth doing.
