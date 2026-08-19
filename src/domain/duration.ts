const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const NOT_EVEN_A_MINUTE = 1;
const NOT_EVEN_AN_HOUR = 1;
const NO_MINUTES_LEFT_OVER = 0;

export const humanizeDuration = (milliseconds: number): string => {
  const totalMinutes = Math.floor(milliseconds / MILLISECONDS_PER_MINUTE);

  if (totalMinutes < NOT_EVEN_A_MINUTE) {
    return "<1m";
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  if (hours < NOT_EVEN_AN_HOUR) {
    return `${minutes}m`;
  }

  if (minutes === NO_MINUTES_LEFT_OVER) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};
