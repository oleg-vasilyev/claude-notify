export const copy = {
  turnEnded: "закончил ход, ждёт тебя",
  planReady: "план готов, жду апрув",
  question: (asked: string) => `вопрос: ${asked}`,
  awaitingAnswer: "ждёт твоего ответа",
  permissionWanted: (tool: string) => `просит разрешение: ${tool}`,
  someTool: "инструмент",

  allowButton: "Разрешить",
  denyButton: "Запретить",
  recommendedOption: (label: string) => `• ${label} ← рекомендует`,
  answerFromPhoneHint: "Нажми кнопку или ответь сообщением своими словами.",
  answeredFromPhone: (said: string) =>
    `Пользователь ответил из Telegram: «${said}». Это и есть ответ на твой вопрос — прими его и продолжай, не задавая вопрос снова.`,
  permissionAnsweredFromPhone: (said: string) =>
    `Пользователь ответил из Telegram: «${said}».`,

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
