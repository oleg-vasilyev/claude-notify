---
name: retrospective
description: Review how a stretch of development in claude-notify was actually carried out — rework, repeated gate runs, sequencing, re-reading — and convert each lesson into a durable rule. Use as the last gate of finish-phase, or before a compaction the user can see coming.
---

# Reviewing the process, not the code

Gate 4 asks whether the diff is releasable. This asks whether producing it was
worth what it cost. It is the only gate whose subject is the transcript, so it
has to run **while the transcript is still there**.

Answer from evidence in this session, not from how you generally work. Where a
count is asked for, count. An answer with no number in it is a guess.

## The five questions

1. **Rework.** What was built and then rebuilt? For each, name the moment the
   direction could have been settled earlier: a signature crossing the layer
   boundary, a decision that was the user's and was guessed instead, a shape
   chosen before the constraint that invalidated it was checked.
2. **Repeated commands.** How many times did each gate run, and how many of those
   runs produced information already on disk under `reports/`?
3. **What the tests missed and the live check caught.** This project has a
   pattern: every user-visible bug so far was found by sending a real ping, not
   by a spec. Name what fell into that gap this phase and what would have closed
   it — usually a fixture that agreed with the code's own assumption.
4. **Sequencing.** Did work start against a subject that was still moving? Was
   anything blocked that could have run alongside?
5. **Reading.** What did you read, re-read or print that you already had in
   context?

## The output is a diff, not a paragraph

Every lesson that would apply to a future phase becomes a **durable change** — a
rule in `finish-phase` or `write-a-spec`, a line in `CLAUDE.md`, a tombstone in
`PLAN.md`, a memory file — and you name the file you changed. `CLAUDE.md` is
under a line budget checked by `npm run docs:check`, so adding to it means
moving something out of it.

**A verdict that changes no default is not a conclusion.** "The tests were fine"
is an observation; "vary the fixture along the axis the code claims not to care
about" is a change.

A lesson left as prose in the conversation is gone at the next compaction, so it
does not count. Drop any lesson that does not generalise beyond this session
rather than recording it: two real changes are worth more than a list of nine.

**Say the honest number even when it is unflattering.** The rule about never
re-running a gate to re-read its output exists because somebody counted the
runs.
