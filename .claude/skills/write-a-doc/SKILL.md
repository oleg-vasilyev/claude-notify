---
name: write-a-doc
description: Decide which claude-notify document a fact belongs in, and how to add it without duplicating what another file already says. Use before editing README.md, PLAN.md, CLAUDE.md or TECH-DEBT.md, and whenever closing a phase that changed behaviour.
---

# Writing a document here

**One fact, one home, and every other file links to it.** A summary of what
another document says in full is duplication wearing a hat: it creates two
things that must change together, and one of them will not.

## Which home

Route by what *kind* of fact it is, not by which document you happen to be
editing:

| The fact is | Home | The test |
|---|---|---|
| What a person types, sees, or has to do to install and run it | `README.md` | somebody who will never read the code needs it |
| What the notifier must do — a rule, a threshold, a refusal, a measured number | `PLAN.md` | it would survive a rewrite in another language |
| How code here must be written | `CLAUDE.md` | a violation is possible in a file nobody is currently thinking about |
| A procedure with an obvious trigger — adding X, closing Y | a **skill** | you would know to ask for it by name |
| Something deliberately unfinished, plus the trigger to pick it up | `TECH-DEBT.md` | it names a trigger, not a wish |
| Why a non-obvious line of configuration exists | a comment **in that config file** | config files are exempt from the no-comments rule |

The dividing question between the two biggest files has been tested for real:
the product was rewritten from PowerShell to TypeScript, and `PLAN.md` needed
five lines changed while `CLAUDE.md` was thrown away and written again. If you
cannot tell where a fact goes, ask which of those two it would have been in.

**A lesson learned in a phase does not automatically belong in `CLAUDE.md`.** If
it only matters while doing one job, it belongs in that job's skill. `CLAUDE.md`
is loaded before every session, so a paragraph there is paid for by every
session that never needed it.

## The four steps, in order

1. **Search before writing.** Grep the other documents for the nouns you are
   about to use. If it is already there, link to it and write nothing.
2. **Search for what it makes false.** A change usually contradicts a sentence
   written before it existed. Deleting that sentence is part of the change, not
   cleanup for later.
3. **Write it once, in the home the table names.** If you find yourself
   explaining the same thing in a second file "briefly", stop — that is the
   duplication being born.
4. **Run `npm run docs:check`.** It resolves every local link and anchor,
   checks the source tree in `README.md` against the real files, checks the npm
   scripts the README names, and holds `CLAUDE.md` to a line budget.

## The budget is the point

`CLAUDE.md` has a line budget so that adding to it costs something. When a new
rule pushes the file over, the fix is to move an old paragraph into the skill
where it belongs, not to raise the number.

## What overlap is allowed

Exactly one thing, deliberately: **`README.md` must be readable without opening
another file.** So the product's central constraint — pings only once you have
actually stepped away — opens the README and also appears in `PLAN.md` as the
design constraint. Everything else that appears twice is a bug.
