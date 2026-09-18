import { HOOK_EVENT, isTheAskTool, type HookEvent, type HookPayload } from "#domain/hook-event.ts";
import { impossible } from "#domain/impossible.ts";


export const SOUND = {
  turnEnded: "turnEnded",
  waitingOnYou: "waitingOnYou",
} as const;

export type Sound = (typeof SOUND)[keyof typeof SOUND];

export const soundFor = (event: HookEvent, payload: HookPayload): Sound | null => {
  switch (event) {
    case HOOK_EVENT.userPromptSubmit:
      return null;

    case HOOK_EVENT.stop:
      return SOUND.turnEnded;

    case HOOK_EVENT.preToolUse:
      return SOUND.waitingOnYou;

    case HOOK_EVENT.permissionRequest:
      return isTheAskTool(payload) ? null : SOUND.waitingOnYou;

    case HOOK_EVENT.notification:
      return SOUND.waitingOnYou;

    default:
      return impossible(event);
  }
};
