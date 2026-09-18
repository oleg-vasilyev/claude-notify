---
name: add-a-hook-event
description: Teach claude-notify to ping or sound on another Claude Code event, or change what an existing event says. Covers the seven places an event is named, the rate limit to choose, and the two hazards the installer exists to prevent. Use when adding or changing a hook event.
---

# Adding a hook event

An event is named in seven places, and missing one is the whole failure mode:

1. **`HOOK_EVENTS`** in `domain/hook-event.ts` — the union. Adding a member makes
   all three switches below a compile error until the new cases are written,
   which is the point of dispatching on a union.
2. **`pingFor`** in `domain/ping/hook-ping.ts` — the case: what the ping says, and
   its rate limit.
3. **`soundFor`** in `domain/ping/hook-sound.ts` — whether the machine itself
   makes a noise, and which of the two it is. An event that does not mean
   *waiting on the user* returns `null` here.
4. **`activityAfter`** in `domain/ping/session-activity.ts` — what the event says
   the session is now doing, which decides whether a ping held in the queue is
   still worth delivering.
5. **`copy.ru.ts`** — the Russian the user reads. No string a user sees may appear
   anywhere else.
6. **`REGISTRATIONS`** in `setup.ts` — the event, and its matcher if it needs one.
7. **`PLAN.md`** — the row in the hook table, saying when it fires, what it says
   and which sound it makes. That table is the contract; the code is its
   implementation.

Then run `npm run setup -- --label home --skip-test` and restart Claude Code.

## Choosing the rate limit

A fallback that can fire in bursts takes the ten-minute limit. A ping carrying
information the user cannot get anywhere else — the text of a question — takes
the short one, because suppressing it costs more than a duplicate.

A **deliberate** ping from the model passes no rate limit at all. Never give one
to a path the model controls: it already decided the ping was worth sending.

## What the payload actually contains

Do not trust the documentation, and do not trust this file either — read the
log. Every hook writes its payload to `~/.claude/claude-notify/log.txt`
(truncated to 400 characters), which is the only honest record of what Claude
Code sends. That log is how we learned `Notification` never fires in the desktop
app, and how the shape of `tool_input.questions` was confirmed.

To see a payload without waiting for the event, fire the hook by hand:

```bash
node src/hook.ts PermissionRequest < .claude/skills/finish-phase/payload.json
```

**Always from a file, never from `echo`.** Not only for non-ASCII: no shell here
delivers even `{"cwd":"D:\\…"}` intact — bash eats the backslashes, PowerShell
re-encodes the bytes — and `hook.ts` reads unparseable JSON as an empty payload,
so the command exits 0 and logs a ping naming no project and no tool. A shell
that re-encodes the bytes is testing the shell, and that is exactly how a
Cyrillic question shipped as mojibake while every test passed.

Copy `payload.json` and edit the copy for an **editor**, not with a shell. The
trap is not only the pipe: a fixture *authored* by `printf`, a heredoc or
`node -e` loses exactly the same backslash, and `{"cwd":"D:\live-check"}` is
invalid JSON that `hook.ts` reads as an empty payload — so the check passes while
proving nothing about the field it was written for. Four payloads were written
that way in one phase and caught only by printing them back. Print the file back
before you fire it.

**And the field's TypeScript type must stay as loose as the JSON is.** A payload
is somebody else's parsed JSON reached through a bare cast, so a type on it is a
wish, not a check — `unknown` where the shape is not guaranteed, narrowed inside
`domain/` where a spec can pass it a `null` and watch what happens. Paid for
twice over in one phase: `background_tasks` was widened from an opaque
`unknown[]` to a typed array, which let the code read `task.status` off whatever
arrived, so a task that was not an object would throw at the top level of
`hook.ts` and swallow the ping — and the same narrowing made the crash impossible
to write a fixture for, since the type forbade the bad value. The looser type
also *reads* as the truth: this is what came over the wire.

**The truncation cuts at 400 characters, so a field near the end is invisible.**
A field after `last_assistant_message` will never appear in the log at all. Add a
temporary `log()` naming that field alone, leave it for as many days as it takes
to see the shapes vary — one phase needed seventeen payloads over five days —
and delete it in the same diff that uses what it found.

## When the log cannot answer, build a throwaway and ask

The log only shows events already registered, and shows nothing at all about
what Claude Code hands a process by other means. Both were answered in minutes
by disposable probes rather than by reasoning:

- **A probe MCP server** — twenty lines that dump `process.env` and the tool
  call's `extra` to a file, registered with `claude mcp add`, driven by one
  `claude -p` run from a chosen directory. That is how
  `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PROJECT_DIR` were found; neither is
  documented, and the whole session-activity design rests on them.
- **A probe project** — a temp directory whose own `.claude/settings.json`
  registers a logging hook for every event you are curious about, including the
  ones this product does not use. Project scope means the user's global settings
  are never touched. That is how `UserPromptSubmit` was confirmed to fire, and
  how a denied tool was shown to produce `PreToolUse` with no `PostToolUse`.

Remove the registration and the files afterwards, and say in the commit that the
fact was measured rather than read — the next person will want to know which.

## The two hazards in the installer

- **Duplicate registrations.** Setup replaces its own entries by looking for the
  marker argument it writes into every hook command. The marker is a constant,
  never anything derived from the path — deriving it from the checkout's name is
  what shipped duplicate hooks once already.
- **Somebody else's hooks.** A group that is not ours is kept untouched, down to
  a sound the user planted themselves — unless they wrote, byte for byte, the
  command an old version of setup wrote. Those are listed in
  `domain/setup/retired-hooks.ts` as frozen literals, never derived from what the
  product does today, because what an old installer wrote is a fact about the
  past: the day somebody changes a wav, a derived list stops matching and the
  orphan survives every future `npm run setup`. Retiring a hook of ours means
  adding its exact command there, never a pattern that could match somebody
  else's. Covered in `retired-hooks.spec.ts` against both shapes seen in the
  wild; a change to the merge itself starts in `hook-registration.spec.ts`.

## What earns a new event at all

An event earns a ping when it means **the agent has stopped and is waiting on
the user**. An event that fires while work continues is noise wearing a
notification's clothes, and the user will mute the bot rather than the event.
`PreToolUse` is registered against two tools for exactly this reason: it fires
for every tool call, and only `AskUserQuestion` and `ExitPlanMode` mean waiting.
