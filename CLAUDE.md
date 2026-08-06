# claude-notify — how the code here is written

Four documents, one job each: `README.md` for arriving and installing,
`PLAN.md` for behaviour and the reasons behind it, this file for style and
gates, `TECH-DEBT.md` for what is deliberately unfinished. The dividing
question: *would the fact survive a rewrite in another language?* Yes →
`PLAN.md`; no → here. A fact lives where its reason lives; the other file gets
a pointer, never a retelling.

## The runtime is Windows PowerShell 5.1

Not pwsh. The scripts must run on a stock Windows box with nothing installed,
which buys the constraint list below — each one has already cost a debugging
session:

- **Every `.ps1` is UTF-8 with BOM.** 5.1 reads BOM-less files as ANSI and
  silently mangles Cyrillic. The Write tool produces BOM-less files, so re-encode
  after writing.
- **No PS6+ syntax**: no `&&`/`||` chains, no ternary, no `??`. `ConvertFrom-Json`
  returns `PSCustomObject` — probe fields with `$obj.PSObject.Properties['name']`,
  never `-AsHashtable`.
- **No here-strings in payload scripts** (`src/` files that `build.ps1` embeds).
  The build wraps each payload in a single-quoted here-string, so a line starting
  with `'@` inside one would truncate the installer. The build refuses such a
  file; keep it able to.
- Telegram bodies are sent as UTF-8 **bytes** with an explicit
  `charset=utf-8` — handing 5.1 a string re-encodes it wrong.

## Layout and the one build rule

`src/` holds two kinds of file and the distinction drives everything:

- **Payload** (`notify-core`, `notify`, `watcher`, `hook-*`) — embedded by
  `build.ps1` into `dist/setup.ps1` and run headless by hooks. Full lint rules;
  no `Write-Host`; logs are the only output.
- **CLI** (`installer.ps1`, plus root `build.ps1` / `check.ps1`) — talk to a
  human; `Write-Host` with color is correct there and is the one excluded lint
  rule.

**Edit only `src/`. `dist/setup.ps1` is a build artifact** — `check.ps1` fails
if it is stale, so the rule is enforced, not aspirational.

## The pure core

Every *decision* lives in `src/notify-core.ps1` as a pure function: state in as
arguments — including the clock — verdict out as a value. No file, HTTP, win32
or `Get-Date` inside. The edges (`notify.ps1`, `watcher.ps1`) gather the state,
call the core, act on the verdict. A new behaviour therefore lands as: a core
function plus its Pester spec, then the edge wiring.

This is what makes the product testable at all — a delivery rule is exercised
in milliseconds instead of by stepping away from the keyboard for three
minutes.

## Style

- PSScriptAnalyzer is the arbiter of everything mechanical: approved verbs,
  singular nouns, no empty catch with silence. `check.ps1` runs it; a finding
  is a failure, not a warning.
- **Comments are allowed but must earn their line**: a hook's contract with
  Claude Code, or a 5.1 trap that naming cannot carry. A comment restating the
  code is deleted on sight. (A deliberate deviation from the reference
  project's no-comments rule — PowerShell 5.1's quirks are too obscure for
  names alone.)
- **Everything the user reads in Telegram is Russian; everything else —**
  **code, comments, commits, docs — is English.** The Russian strings sit in
  the hook scripts and stay under ~200 characters; a copy table would be
  ceremony at this size and is deliberately absent.
- State files (`last-sent-*`, `watcher.lock`) are written ASCII; timestamps are
  ISO round-trip (`'o'`) parsed with invariant culture, so a locale change
  cannot corrupt a stamp.

## Tests and gates

Pester specs live in `tests/` and cover the pure core exhaustively — every
function, every branch that decides a delivery. The impure edges are proven by
pipe-tests (`README.md` shows the manual send; hooks are tested by piping a
synthetic payload), not by units — mocking `Invoke-RestMethod` to watch it be
called is theatre.

Before any commit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File check.ps1
```

Three gates — lint clean, tests green, dist fresh — and a release commit states
its numbers. Say how big a phase is before starting it, in a line, so it can be
argued down.

A check that never fired is indistinguishable from one with nothing to report:
when adding a gate, first commit a deliberate violation to see it fail. The
build's here-string guard and the dist-drift gate were both proven this way.
