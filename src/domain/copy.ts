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
  questionClosedWith: (asked: string, said: string) => `${asked}\n\n✓ Ответ: ${said}`,
  questionExpired: (asked: string) => `${asked}\n\n⏳ Ответа не было — вопрос вернулся в приложение.`,
  answeredFromPhone: (said: string) =>
    `Пользователь ответил из Telegram: «${said}». Это и есть ответ на твой вопрос — прими его и продолжай, не задавая вопрос снова.`,
  permissionAnsweredFromPhone: (said: string) =>
    `Пользователь ответил из Telegram: «${said}».`,

  sessionWindow: "5 часов",
  weekWindow: "неделя",
  windowShare: (bar: string, percent: number, label: string) => `${bar} ${percent}% · ${label}`,
  windowScopedTo: (label: string, model: string) => `${label}/${model}`,
  windowResetsIn: (left: string) => ` · сброс через ${left}`,
  windowSeparator: "\n",

  lessThanAMinute: "меньше минуты",
  hours: (count: number) => `${count} ч`,
  minutes: (count: number) => `${count} мин`,
} as const;
