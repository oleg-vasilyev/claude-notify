import { copy } from "#domain/copy.ts";


const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

export const humanizeDuration = (milliseconds: number): string => {
  const totalMinutes = Math.floor(milliseconds / MILLISECONDS_PER_MINUTE);

  if (totalMinutes < 1) {
    return copy.lessThanAMinute;
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  if (hours < 1) {
    return copy.minutes(minutes);
  }

  if (minutes === 0) {
    return copy.hours(hours);
  }

  return `${copy.hours(hours)} ${copy.minutes(minutes)}`;
};
