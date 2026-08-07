import { describe, expect, it } from "vitest";

import { answersIn, callbackDataFor, highestUpdateId, type TelegramUpdate } from "#domain/answer.ts";
import { ALLOW, DENY, type AskedQuestion } from "#domain/question.ts";


const CHAT = "42";
const SOMEONE_ELSE = 999;
const FIRST_UPDATE = 7;
const SECOND_UPDATE = 9;

const choice = (id: string): AskedQuestion => ({
  id,
  kind: "choice",
  text: "Чем продолжим?",
  options: [
    { value: "0", label: "Форк", recommended: true },
    { value: "1", label: "Та же", recommended: false },
  ],
});

const permission = (id: string): AskedQuestion => ({
  id,
  kind: "permission",
  text: "просит разрешение: Bash",
  options: [
    { value: ALLOW, label: "Разрешить", recommended: false },
    { value: DENY, label: "Запретить", recommended: false },
  ],
});

const pressed = (data: string, chat = Number(CHAT)): TelegramUpdate => ({
  update_id: FIRST_UPDATE,
  callback_query: { id: "cb1", data, message: { chat: { id: chat } } },
});

const wrote = (text: string, chat = Number(CHAT)): TelegramUpdate => ({
  update_id: FIRST_UPDATE,
  message: { text, chat: { id: chat } },
});

describe("callbackDataFor", () => {
  it("joins the question and the option so a press can be traced back", () => {
    expect(callbackDataFor("abc12345", "1")).toBe("abc12345:1");
  });
});

describe("highestUpdateId", () => {
  it("has nothing to remember when no updates arrived", () => {
    expect(highestUpdateId([])).toBeNull();
  });

  it("remembers the newest update, whatever order they came in", () => {
    expect(
      highestUpdateId([{ update_id: SECOND_UPDATE }, { update_id: FIRST_UPDATE }])
    ).toBe(SECOND_UPDATE);
  });

  it("ignores an update with no id rather than treating it as zero", () => {
    expect(highestUpdateId([{}, { update_id: FIRST_UPDATE }])).toBe(FIRST_UPDATE);
  });
});

describe("answersIn", () => {
  it("takes a pressed button as the answer to its own question", () => {
    const matched = answersIn([pressed("abc12345:1")], [choice("abc12345")], CHAT);

    expect(matched).toEqual([
      { id: "abc12345", answer: { said: "Та же", chosenValue: "1", callbackId: "cb1" } },
    ]);
  });

  it("routes a press to the question it names, not to the first one waiting", () => {
    const matched = answersIn(
      [pressed("second99:0")],
      [choice("first111"), choice("second99")],
      CHAT
    );

    expect(matched).toEqual([
      { id: "second99", answer: { said: "Форк", chosenValue: "0", callbackId: "cb1" } },
    ]);
  });

  it("ignores a press for a question nobody is waiting on", () => {
    expect(answersIn([pressed("gone1234:0")], [choice("abc12345")], CHAT)).toEqual([]);
  });

  it("ignores a press for an option the question does not have", () => {
    expect(answersIn([pressed("abc12345:9")], [choice("abc12345")], CHAT)).toEqual([]);
  });

  it("ignores callback data that is not a question and an option", () => {
    expect(answersIn([pressed("nonsense")], [choice("abc12345")], CHAT)).toEqual([]);
  });

  it("refuses a press from any chat but the configured one", () => {
    expect(answersIn([pressed("abc12345:1", SOMEONE_ELSE)], [choice("abc12345")], CHAT)).toEqual(
      []
    );
  });

  it("takes written words as the answer when exactly one question is waiting", () => {
    const matched = answersIn([wrote("ни то ни другое, сделай форк")], [choice("abc12345")], CHAT);

    expect(matched).toEqual([
      {
        id: "abc12345",
        answer: { said: "ни то ни другое, сделай форк", chosenValue: null, callbackId: null },
      },
    ]);
  });

  it("refuses written words while two questions are waiting, since they would answer both", () => {
    expect(answersIn([wrote("да")], [choice("first111"), choice("second99")], CHAT)).toEqual([]);
  });

  it("refuses written words for a permission, which may only be pressed", () => {
    expect(answersIn([wrote("да, разрешаю")], [permission("abc12345")], CHAT)).toEqual([]);
  });

  it("still routes a press while several questions wait, where words would be refused", () => {
    const matched = answersIn(
      [pressed("abc12345:0")],
      [choice("abc12345"), choice("other999")],
      CHAT
    );

    expect(matched).toHaveLength(1);
  });

  it("refuses written words from any chat but the configured one", () => {
    expect(answersIn([wrote("да", SOMEONE_ELSE)], [choice("abc12345")], CHAT)).toEqual([]);
  });

  it("ignores a message of only whitespace", () => {
    expect(answersIn([wrote("   ")], [choice("abc12345")], CHAT)).toEqual([]);
  });

  it("trims what the user wrote", () => {
    const matched = answersIn([wrote("  форк  ")], [choice("abc12345")], CHAT);

    expect(matched[0]?.answer.said).toBe("форк");
  });

  it("answers a question once, even when two updates would both match it", () => {
    const matched = answersIn(
      [pressed("abc12345:0"), pressed("abc12345:1")],
      [choice("abc12345")],
      CHAT
    );

    expect(matched).toEqual([
      { id: "abc12345", answer: { said: "Форк", chosenValue: "0", callbackId: "cb1" } },
    ]);
  });

  it("finds nothing in an empty batch of updates", () => {
    expect(answersIn([], [choice("abc12345")], CHAT)).toEqual([]);
  });

  it("finds nothing when no question is waiting", () => {
    expect(answersIn([pressed("abc12345:0")], [], CHAT)).toEqual([]);
  });
});
