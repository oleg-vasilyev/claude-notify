import { spawnSync } from "node:child_process";

import { SOUND, type Sound } from "#domain/ping/hook-sound.ts";
import { log } from "#state/log.ts";


const PLAYER = "powershell";

const WAV: Record<Sound, string> = {
  [SOUND.turnEnded]: "C:\\Windows\\Media\\Windows Notify.wav",
  [SOUND.waitingOnYou]: "C:\\Windows\\Media\\chimes.wav",
};

export const playSound = (sound: Sound): void => {
  const wav = WAV[sound];
  const result = spawnSync(
    PLAYER,
    ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${wav}').PlaySync()`],
    { stdio: "ignore", windowsHide: true }
  );

  if (result.error !== undefined) {
    log(`WARN the sound did not play: ${String(result.error)}`);
  }
};
