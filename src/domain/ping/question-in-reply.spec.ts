import { describe, expect, it } from "vitest";

import { replyAsksAQuestion } from "#domain/ping/question-in-reply.ts";


describe("replyAsksAQuestion", () => {
  it.each([
    "Гейты зелёные. Делаем?",
    "Вопросы:\n\n1. Какой порог у страховки? Если тридцать минут, звук опоздает.\n- а) Тридцать",
    "**1. Что делаем со старыми записями в очереди?** Это решение продукта.",
    "**Вопрос до коммита: нужен ли новый тег?**",
    "Вынесу это отдельной фазой. Так?",
    "Shall I merge it?",
    "Which one wins (the cache)?\n\nThe rest is done.",
    "Остановить watcher с pid 22552?",
    "Как назвать новый модуль?!",
    "Коммитить в `main`?",
    "Оставить `willCarryOn` или переименовать в `holdsTheTurn`?",
    'Назвать его "held" или "parked"?',
    "Сделать как в «закончил ход»?",
    "¿Listo?",
    "Порог > 30 минут подходит?",
  ])("hears a question in %j", (reply) => {
    expect(replyAsksAQuestion(reply)).toBe(true);
  });

  it.each([
    "Готово. Гейты зелёные, коммит запушен.",
    "В подписи стоит «Ready? Press start», и она помещается.",
    'The label reads "Ready? Press start", and fits.',
    "Флаг `ready?` убран.",
    "```\nis it done?\n```\nСобрал и проверил.",
    "Строки без числа покажут «?» вместо уровня.",
    "> Shall I merge it?\n\nYou asked that; I merged.",
    "Ссылка https://example.com/search?q=a-project открывается.",
    "Значение `a ?? b` по умолчанию, и `x ? y : z` тоже.",
    "Код ответа ?? значение по умолчанию.",
    "",
  ])("hears no question in %j", (reply) => {
    expect(replyAsksAQuestion(reply)).toBe(false);
  });

  it("hears a rhetorical question too, since prose alone cannot tell it apart", () => {
    expect(replyAsksAQuestion("Why did the sound stay silent? A server held the turn. Fixed.")).toBe(true);
  });

  it("hears no question when the payload carried no reply", () => {
    expect(replyAsksAQuestion(undefined)).toBe(false);
  });

  it("hears no question in a reply that is not text", () => {
    expect(replyAsksAQuestion({ text: "Делаем?" })).toBe(false);
  });
});
