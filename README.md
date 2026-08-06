# claude-notify

Telegram pings from [Claude Code](https://claude.com/claude-code) when the agent
is waiting on you — but only once you have actually stepped away from the machine.

The problem it solves: an agent works for hours, you walk away, the turn ends
with a question, the sound notification plays to an empty room — and the agent
sits idle until you happen to come back.

```
[job-finder@home] Закончил фазу 2, жду апрув на миграцию БД
```

A ping carries the project, the machine it came from, and what is needed. While
you are at the keyboard nothing is sent — the sound is enough; the ping is
queued and delivered a minute or two after you actually leave.
[PLAN.md](PLAN.md) explains the machinery and why it is shaped this way.

## Installing

1. Create a bot: open **@BotFather** in Telegram → `/newbot` → keep the token.
2. Write `/start` to your new bot (a bot cannot message you first).
3. Copy the one file [`dist/setup.ps1`](dist/setup.ps1) to the target machine
   and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1
```

It asks for the token and a machine label, resolves your chat id, writes the
scripts to `~/.claude/scripts/telegram-notify/`, registers the Claude Code hooks
(Telegram and sound), adds the ping rule to the global `~/.claude/CLAUDE.md`,
and sends a test message.

4. Restart Claude Code so the hooks load.

The installer is idempotent — run it again to update. It rewrites only its own
hook entries and leaves everything else in `settings.json` alone. For
automation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 -Token "123:ABC" -MachineLabel work -NonInteractive
```

## Configuration

`~/.claude/scripts/telegram-notify/config.json`:

| Key | Meaning |
| --- | --- |
| `token` | the bot token from BotFather |
| `chat_id` | your chat with the bot, resolved automatically |
| `machine_label` | the machine name in pings: `[job-finder@work]` |
| `min_idle_minutes` | minutes without keyboard or mouse that count as "away" (default 3) |
| `stale_minutes` | minutes after which a queued ping expires undelivered (default 15) |

One bot serves any number of machines; the label is what tells their pings
apart. The token lives only in this file, which never leaves the machine — the
installer does not embed it and the repository ignores it.

## When a ping does not arrive

Everything the notifier decides is one line in
`~/.claude/scripts/telegram-notify/log.txt`:

| Line | Meaning |
| --- | --- |
| `SENT` | delivered |
| `QUEUED idle=Ns` | you were at the keyboard; the watcher delivers it once you leave |
| `DROP stale` | it sat queued longer than `stale_minutes` — you were here all along |
| `SKIP rate-limit [proj]` | that project pinged too recently |
| `HOOK <event>` | a Claude Code hook fired, with its payload |
| `ERROR send failed` | the Telegram API refused — the reason follows |
| `WATCHER started/exit` | the background deliverer of queued pings |

No line at all means the script was never called: the model did not ping and no
hook fired. To prove the pipe end to end, bypassing the presence filter:

```powershell
powershell -NoProfile -File "$env:USERPROFILE\.claude\scripts\telegram-notify\notify.ps1" -Message "[test] проверка" -MinIdleMinutes 0
```

## Development

Windows PowerShell 5.1 is the target runtime — the scripts run on any Windows
box with nothing installed. The two dev dependencies (PSScriptAnalyzer, Pester)
are fetched by `check.ps1` on first run.

```
src/notify-core.ps1              every delivery decision, pure - state in, verdict out
src/notify.ps1                   the impure edge: config, win32 idle probe, HTTP, queue
src/watcher.ps1                  delivers queued pings once you go idle
src/hook-stop.ps1                turn ended - the ball is in your court
src/hook-ask.ps1                 a question dialog or a plan approval, mid-turn
src/hook-permission-request.ps1  a permission prompt, mid-turn
src/hook-notification.ps1        the event that has never been seen to fire
src/installer.ps1                setup logic; #__PAYLOAD__ marks where scripts embed
build.ps1                        assembles src/ into dist/setup.ps1
check.ps1                        the gate: lint, tests, build, dist drift
tests/                           Pester specs for the pure core
```

Edit **only `src/`**; `dist/setup.ps1` is a build artifact:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
```

Before any commit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File check.ps1
```

Three gates: PSScriptAnalyzer clean, Pester green, and freshly built output
byte-identical to the committed `dist/setup.ps1` — so editing `src/` and
forgetting to rebuild cannot land.

## The other three documents

- **[PLAN.md](PLAN.md)** — what the notifier does and why: the two sources of a
  ping, the delivery pipeline, the invariants, and the dead ends already paid
  for. Read it before changing behaviour.
- **[CLAUDE.md](CLAUDE.md)** — how the code here is written: PowerShell 5.1
  constraints, the pure core rule, and the gates. Read it before writing code.
- **[TECH-DEBT.md](TECH-DEBT.md)** — what is deliberately unfinished, each entry
  with the trigger that would make it worth doing.
