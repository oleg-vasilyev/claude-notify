import { humanizeDuration } from "#domain/duration.ts";


const RESET_TIME_MATTERS_ABOVE_PERCENT = 80;
const BAR_SEGMENTS = 10;
const WHOLE = 100;
const FILLED = "━";
const EMPTY = "─";
const AT_LEAST_A_SLIVER = 1;
const NOTHING_SPENT = 0;
const ALREADY_RESET = 0;
const NO_WINDOWS = 0;
const NO_LABEL = 0;
const PERCENT_COLUMN = 4;
const SESSION_GROUP = "session";
const WEEKLY_GROUP = "weekly";
const SESSION_WINDOW = "5-hour";
const WEEK_WINDOW = "weekly";

const segmentsFor = (percent: number): number => {
  if (percent <= NOTHING_SPENT) {
    return NOTHING_SPENT;
  }

  if (percent >= WHOLE) {
    return BAR_SEGMENTS;
  }

  const exact = Math.round((percent / WHOLE) * BAR_SEGMENTS);

  return Math.min(BAR_SEGMENTS - AT_LEAST_A_SLIVER, Math.max(AT_LEAST_A_SLIVER, exact));
};

const bar = (percent: number): string => {
  const filled = segmentsFor(percent);

  return FILLED.repeat(filled) + EMPTY.repeat(BAR_SEGMENTS - filled);
};

export type UsageScope = {
  model?: { display_name?: string | null } | null;
} | null;

export type UsageLimit = {
  group?: string;
  percent?: number | null;
  resets_at?: string | null;
  scope?: UsageScope;
};

export type UsageFlatWindow = {
  utilization?: number | null;
  resets_at?: string | null;
} | null;

export type UsageSnapshot = {
  limits?: UsageLimit[] | null;
  five_hour?: UsageFlatWindow;
  seven_day?: UsageFlatWindow;
};

type Window = {
  label: string;
  percent: number;
  resetsAt: string | null;
};

const labelFor = (limit: UsageLimit): string => {
  const model = limit.scope?.model?.display_name;

  if (limit.group === SESSION_GROUP) {
    return SESSION_WINDOW;
  }

  return model === null || model === undefined || model === "" ? WEEK_WINDOW : model.toLowerCase();
};

const asWindow = (limit: UsageLimit): Window | null =>
  limit.percent === null || limit.percent === undefined
    ? null
    : { label: labelFor(limit), percent: limit.percent, resetsAt: limit.resets_at ?? null };

const asFlatWindow = (flat: UsageFlatWindow | undefined, label: string): Window | null =>
  flat === null || flat === undefined || flat.utilization === null || flat.utilization === undefined
    ? null
    : { label, percent: flat.utilization, resetsAt: flat.resets_at ?? null };

const windowsIn = (snapshot: UsageSnapshot): Window[] => {
  const limits = snapshot.limits ?? [];
  const named = limits
    .filter((limit) => limit.group === SESSION_GROUP || limit.group === WEEKLY_GROUP)
    .map(asWindow)
    .filter((window): window is Window => window !== null);

  if (named.length > NO_WINDOWS) {
    return named;
  }

  return [
    asFlatWindow(snapshot.five_hour, SESSION_WINDOW),
    asFlatWindow(snapshot.seven_day, WEEK_WINDOW),
  ].filter((window): window is Window => window !== null);
};

const resetCountdown = (window: Window, now: Date): string => {
  if (window.percent < RESET_TIME_MATTERS_ABOVE_PERCENT || window.resetsAt === null) {
    return "";
  }

  const resetsAt = Date.parse(window.resetsAt);

  if (Number.isNaN(resetsAt)) {
    return "";
  }

  const left = resetsAt - now.getTime();

  return left <= ALREADY_RESET ? "" : `  ${humanizeDuration(left)}`;
};

export const usageBlock = (snapshot: UsageSnapshot | null, now: Date): string => {
  if (snapshot === null) {
    return "";
  }

  const windows = windowsIn(snapshot);
  const column = Math.max(...windows.map((window) => window.label.length), NO_LABEL);

  return windows
    .map((window) => {
      const percent = Math.round(window.percent);
      const share = `${percent}%`.padStart(PERCENT_COLUMN);

      return `${window.label.padEnd(column)}  ${bar(percent)}  ${share}${resetCountdown(window, now)}`;
    })
    .join("\n");
};

export const USAGE = { read: "read", unavailable: "unavailable" } as const;

export type UsageRead =
  | { kind: typeof USAGE.read; snapshot: UsageSnapshot }
  | { kind: typeof USAGE.unavailable; why: string };
