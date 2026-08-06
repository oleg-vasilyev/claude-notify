export const copy = {
  turnEnded: "закончил ход, ждёт тебя",
  planReady: "план готов, жду апрув",
  question: (asked: string) => `вопрос: ${asked}`,
  awaitingAnswer: "ждёт твоего ответа",
  permissionWanted: (tool: string) => `просит разрешение: ${tool}`,
  someTool: "инструмент",

  sessionWindow: "5ч",
  weekWindow: "нед",
  windowShare: (label: string, percent: number) => `${label} ${percent}%`,
  windowScopedTo: (label: string, model: string) => `${label}/${model}`,
  windowResetsIn: (left: string) => ` (сброс через ${left})`,
  windowSeparator: " · ",

  lessThanAMinute: "меньше минуты",
  hours: (count: number) => `${count} ч`,
  minutes: (count: number) => `${count} мин`,
} as const;
