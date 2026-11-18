import { describe, expect, it } from "vitest";

import { chatTitleIn, withChatTitle } from "#domain/ping/chat-title.ts";
import { projectKeyOf } from "#domain/project.ts";


describe("withChatTitle", () => {
  const TITLE = "Разбор логов";

  it("puts the title after the labelled project prefix", () => {
    expect(withChatTitle("[a-project@home] закончил ход, ждёт тебя", TITLE)).toBe(
      "[a-project@home] «Разбор логов» закончил ход, ждёт тебя"
    );
  });

  it("keeps the project key the rate limit reads, since the title sits outside the brackets", () => {
    expect(projectKeyOf(withChatTitle("[a-project@home] закончил ход", TITLE))).toBe("a-project");
  });

  it("leads with the title when the message has no prefix", () => {
    expect(withChatTitle("закончил ход", TITLE)).toBe("«Разбор логов» закончил ход");
  });

  it("puts a space after a prefix written without one", () => {
    expect(withChatTitle("[a-project]закончил ход", TITLE)).toBe("[a-project] «Разбор логов» закончил ход");
  });

  it("leaves the message alone when the chat has no title", () => {
    expect(withChatTitle("[a-project@home] закончил ход", null)).toBe("[a-project@home] закончил ход");
  });
});


const titled = (title: unknown): string =>
  JSON.stringify({ type: "custom-title", customTitle: title, sessionId: "a-session" });

const said = JSON.stringify({ type: "assistant", message: { content: "custom-title" } });

describe("chatTitleIn", () => {
  it("reads the chat's title from the transcript", () => {
    expect(chatTitleIn([said, titled("Разбор логов"), said].join("\n"))).toBe("Разбор логов");
  });

  it("takes the latest title, since a chat can be renamed", () => {
    expect(chatTitleIn([titled("Старое имя"), said, titled("Новое имя")].join("\n"))).toBe("Новое имя");
  });

  it("looks past a broken last record to the one before it", () => {
    const cutInHalf = titled("Новое имя").slice(0, -5);

    expect(chatTitleIn([titled("Старое имя"), cutInHalf].join("\n"))).toBe("Старое имя");
  });

  it("looks past a record that names a title that is not text", () => {
    expect(chatTitleIn([titled("Старое имя"), titled(42), titled("   ")].join("\n"))).toBe("Старое имя");
  });

  it("trims the title, so a stray space does not reach the message", () => {
    expect(chatTitleIn(titled("  Разбор логов "))).toBe("Разбор логов");
  });

  it("finds nothing in a transcript that was never named", () => {
    expect(chatTitleIn([said, said].join("\n"))).toBeNull();
  });

  it("finds nothing in a fragment that will not parse", () => {
    expect(chatTitleIn('"type":"custom-title"')).toBeNull();
  });

  it("finds nothing in a record that parses into a shape with no title", () => {
    expect(chatTitleIn('[{"type":"custom-title","customTitle":"Внутри списка"}]')).toBeNull();
  });

  it("finds nothing in an empty tail", () => {
    expect(chatTitleIn("")).toBeNull();
  });
});
