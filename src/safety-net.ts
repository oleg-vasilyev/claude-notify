import {
  HELD_VERDICT,
  heldVerdict,
  noteAfterRinging,
  SAFETY_NET_SOUND,
  type HeldTurnEnd,
} from "#domain/ping/held-turn-end.ts";
import { impossible } from "#domain/impossible.ts";
import { playSound } from "#sound/play-sound.ts";
import { forgetHeldTurnEnd, readHeldTurnEnds } from "#state/held-turn-end-files.ts";
import { log } from "#state/log.ts";
import { readSessionNote, writeSessionNote } from "#state/session-note.ts";
import { deliver } from "#app/deliver.ts";


const ring = async (held: HeldTurnEnd, now: number): Promise<void> => {
  forgetHeldTurnEnd(held);
  writeSessionNote(held.sessionId, noteAfterRinging(held, now));
  playSound(SAFETY_NET_SOUND);
  log(`SOUND ${SAFETY_NET_SOUND} | the safety net, nothing happened since a held turn end`);
  await deliver({ ...held.ping, sessionId: held.sessionId, raisedAt: now });
};

const settleOne = async (held: HeldTurnEnd, now: number): Promise<boolean> => {
  const verdict = heldVerdict(held, readSessionNote(held.sessionId), now);

  switch (verdict) {
    case HELD_VERDICT.superseded:
      forgetHeldTurnEnd(held);

      return false;

    case HELD_VERDICT.waiting:
      return true;

    case HELD_VERDICT.ring:
      await ring(held, now);

      return false;

    default:
      return impossible(verdict);
  }
};

export const settleHeldTurnEnds = async (now: number): Promise<boolean> => {
  let stillHolding = false;

  for (const held of readHeldTurnEnds()) {
    try {
      stillHolding = (await settleOne(held, now)) || stillHolding;
    } catch (failure) {
      log(`WARN a held turn end could not be settled: ${String(failure)} | ${held.ping.message}`);
    }
  }

  return stillHolding;
};
