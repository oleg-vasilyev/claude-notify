import { copy } from "#domain/copy.ru.ts";
import { humanizeDuration } from "#domain/duration.ts";


const RESET_TIME_MATTERS_ABOVE_PERCENT = 80;
const BAR_SEGMENTS = 10;
const WHOLE = 100;
const FILLED = "▰";
const EMPTY = "▱";
const AT_LEAST_A_SLIVER = 1;
const NOTHING_SPENT = 0;

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
  percent: number;
  resetsAt: string | null;
  model: string | null;
};

const asWindow = (limit: UsageLimit): Window | null => {
  if (limit.percent === null || limit.percent === undefined) {
    return null;
  }

  return {
    percent: limit.percent,
    resetsAt: limit.resets_at ?? null,
    model: limit.scope?.model?.display_name ?? null,
  };
};

const asFlatWindow = (flat: UsageFlatWindow | undefined): Window | null => {
  if (flat === null || flat === undefined) {
    return null;
  }

  if (flat.utilization === null || flat.utilization === undefined) {
    return null;
  }

  return { percent: flat.utilization, resetsAt: flat.resets_at ?? null, model: null };
};

const busiestOf = (limits: readonly UsageLimit[], group: string): Window | null => {
  let busiest: Window | null = null;

  for (const limit of limits) {
    if (limit.group !== group) {
      continue;
    }

    const window = asWindow(limit);

    if (window !== null && (busiest === null || window.percent > busiest.percent)) {
      busiest = window;
    }
  }

  return busiest;
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

  if (left <= 0) {
    return "";
  }

  return copy.windowResetsIn(humanizeDuration(left));
};

const describe = (window: Window | null, label: string, now: Date): string | null => {
  if (window === null) {
    return null;
  }

  const named = window.model === null ? label : copy.windowScopedTo(label, window.model);
  const percent = Math.round(window.percent);

  return copy.windowShare(bar(percent), percent, named) + resetCountdown(window, now);
};

export const usageLine = (snapshot: UsageSnapshot | null, now: Date): string => {
  if (snapshot === null) {
    return "";
  }

  const limits = snapshot.limits ?? [];
  const session = busiestOf(limits, "session") ?? asFlatWindow(snapshot.five_hour);
  const week = busiestOf(limits, "weekly") ?? asFlatWindow(snapshot.seven_day);

  const described = [
    describe(session, copy.sessionWindow, now),
    describe(week, copy.weekWindow, now),
  ].filter((part) => part !== null);

  return described.join(copy.windowSeparator);
};
