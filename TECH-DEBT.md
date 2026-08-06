# claude-notify — what is owed

Work finished enough to stop, but not finished. An entry names a **trigger**,
not a wish — without one it is a note that will still be here in a year. Delete
an entry when its trigger fires and the work is done; the git history
remembers.

---

## A failed send is lost

`notify.ps1` logs `ERROR send failed` and exits 1 — no retry, no re-queue. A
flaky wifi moment at the exact second of a ping loses it, and the fallback
hooks may be rate-limited when the next event fires. The honest fix is to
re-queue the message with its timestamp so the watcher retries it, reusing the
staleness rule as the give-up rule.

**Pick it up when `ERROR send failed` appears in a real log** — until a real
network blip eats a real ping, the machinery is speculative.

---

## `hook-notification.ps1` ships although its event has never fired

A full day of real use produced zero `HOOK Notification` lines in the desktop
app (see the tombstone in `PLAN.md`). The hook stays registered because it is
harmless and the event is documented to cover permission prompts and idle
waits — in some other host it may simply work.

**Delete the hook and its registration if a month of terminal-CLI sessions
also never logs `HOOK Notification`; keep it and delete this entry the first
time one appears.**

---

## `log.txt` grows forever

Every decision appends; nothing rotates or trims. The first day of real use
reached 180 KB in 73 lines — hook payloads, not decisions, were the whole
weight, so they are now truncated to 400 characters and the honest rate is
unknown again.

**Rotate (or truncate to the last N lines on watcher start) when a real
`log.txt` passes 1 MB.**

---

## There is no uninstaller

Setup adds hook entries, scripts and a CLAUDE.md section; removing them is a
by-hand exercise today. The installer already knows how to find its own hook
entries (it rewrites them on every run), so `-Uninstall` is mostly written.

**Write it the first time the hooks actually need to come off a machine.**

---

## The HTTP edge has no test seam

`notify.ps1` calls `api.telegram.org` directly; nothing can exercise the send
path, the stamp write and the log line together without a real token. A fake
Bot API (a local HTTP listener) would make the edge testable end to end.

**Build it when phase 4 starts** — a two-way bot needs the fake anyway to test
callbacks, and building it twice would be the real waste.

---

## Not debt, deliberately

- **The installer embeds no token.** Copying `dist/setup.ps1` anywhere is safe
  by construction; the price is retyping the token per machine, and it is paid
  on purpose (invariant 5 in `PLAN.md`).
- **Hook scripts log their full stdin payload.** Verbose, but the payloads are
  the only documentation of what Claude Code actually sends each event, and
  they have already falsified the docs once.
- **`check.ps1` installs its own dev dependencies** into the user profile on
  first run. A gate that fails with "install Pester yourself" on a fresh
  machine would just be this behaviour with extra steps.
- **The queue dedupes to one message per project, even across sources.** A
  model ping and a hook ping about the same wait are one fact; the longest
  message wins because context beats boilerplate.
