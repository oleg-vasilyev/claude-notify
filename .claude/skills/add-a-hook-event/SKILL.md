---
name: add-a-hook-event
description: Teach claude-notify to ping on another Claude Code event, or change what an existing event says. Covers the five places an event is named, the rate limit to choose, and the two hazards the installer exists to prevent. Use when adding or changing a hook event.
---

# Adding a hook event

An event is named in five places, and missing one is the whole failure mode:

1. **`HOOK_EVENTS`** in `domain/hook-ping.ts` — the union. Adding a member makes
   the `switch` below it a compile error until the new case is written, which is
   the point of dispatching on a union.
2. **`pingFor`** — the case: what the ping says, and its rate limit.
3. **`copy.ts`** — the Russian the user reads. No string a user sees may appear
   anywhere else.
4. **`REGISTRATIONS`** in `setup.ts` — the event, its matcher if it needs one,
   and a sound if the event deserves one.
5. **`PLAN.md`** — the row in the hook table, saying when it fires and what it
   says. That table is the contract; the code is its implementation.

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
echo '{"cwd":"D:\\Temp\\FoolProof","tool_name":"Bash"}' | node src/hook.ts PermissionRequest
```

Write the JSON to a **file** and pipe it with `type` when it contains anything
non-ASCII — a shell that re-encodes the bytes is testing the shell, and that is
exactly how a Cyrillic question shipped as mojibake while every test passed.

## The two hazards in the installer

- **Duplicate registrations.** Setup replaces its own entries by looking for the
  marker argument it writes into every hook command. The marker is a constant,
  never anything derived from the path — deriving it from the checkout's name is
  what shipped duplicate hooks once already.
- **Somebody else's hooks.** A group that is not ours is kept untouched, and the
  sound hook is added only when the event has none. Both are covered in
  `hook-registration.spec.ts`; a change to that merge starts there.

## What earns a new event at all

An event earns a ping when it means **the agent has stopped and is waiting on
the user**. An event that fires while work continues is noise wearing a
notification's clothes, and the user will mute the bot rather than the event.
`PreToolUse` is registered against two tools for exactly this reason: it fires
for every tool call, and only `AskUserQuestion` and `ExitPlanMode` mean waiting.
