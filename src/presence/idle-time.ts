import koffi from "koffi";

import { log } from "#state/log.ts";


const MILLISECONDS_PER_SECOND = 1000;

const probe = () => {
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const lastInputInfo = koffi.struct("LASTINPUTINFO", { cbSize: "uint32", dwTime: "uint32" });

  const getLastInputInfo = user32.func(
    "bool __stdcall GetLastInputInfo(_Inout_ LASTINPUTINFO *plii)"
  );
  const getTickCount = kernel32.func("uint32 __stdcall GetTickCount()");

  return (): number => {
    const info = { cbSize: koffi.sizeof(lastInputInfo), dwTime: 0 };

    if (!getLastInputInfo(info)) {
      throw new Error("GetLastInputInfo refused");
    }

    return Math.floor((getTickCount() - info.dwTime) / MILLISECONDS_PER_SECOND);
  };
};

let idleProbe: (() => number) | null = null;

export const idleSeconds = (): number => {
  try {
    idleProbe ??= probe();

    return idleProbe();
  } catch (failure) {
    log(`WARN presence probe failed, treating you as away: ${String(failure)}`);

    return Number.MAX_SAFE_INTEGER;
  }
};
