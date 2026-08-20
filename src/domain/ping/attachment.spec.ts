import { describe, expect, it } from "vitest";

import {
  ATTACHMENT,
  attachmentFor,
  attachmentReport,
  captionFits,
  nameIn,
  refusedPicture,
  wasAttached,
  type PictureFacts,
} from "#domain/ping/attachment.ts";


const A_PICTURE = "D:/work/mockup.png";
const SMALL = 40_000;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const CAPTION_LIMIT = 1024;

const facts = (over: Partial<PictureFacts> = {}): PictureFacts => ({
  path: A_PICTURE,
  bytes: SMALL,
  channelCarriesPictures: true,
  ...over,
});

describe("attachmentFor", () => {
  it("takes a picture that is there, of a kind Telegram shows", () => {
    expect(attachmentFor(facts())).toEqual({
      kind: ATTACHMENT.ready,
      path: A_PICTURE,
      name: "mockup.png",
    });
  });

  it("takes every kind the description promises", () => {
    for (const suffix of ["png", "jpg", "jpeg", "gif", "webp"]) {
      expect(attachmentFor(facts({ path: `/tmp/a.${suffix}` })).kind).toBe(ATTACHMENT.ready);
    }
  });

  it("ignores the case of the suffix, since a camera writes .JPG", () => {
    expect(attachmentFor(facts({ path: "/tmp/photo.JPG" })).kind).toBe(ATTACHMENT.ready);
  });

  it("refuses a kind Telegram would show as a file nobody can open", () => {
    expect(attachmentFor(facts({ path: "/tmp/report.pdf" }))).toEqual({
      kind: ATTACHMENT.unsupported,
      path: "/tmp/report.pdf",
      name: "report.pdf",
    });
  });

  it("refuses a name with no suffix at all", () => {
    expect(attachmentFor(facts({ path: "/tmp/mockup" })).kind).toBe(ATTACHMENT.unsupported);
  });

  it("reads a dotfile as having no suffix, since .png is a whole name and not a kind", () => {
    expect(attachmentFor(facts({ path: "/tmp/.png" })).kind).toBe(ATTACHMENT.unsupported);
  });

  it("says nothing is there when the edge could not measure the file", () => {
    expect(attachmentFor(facts({ bytes: null }))).toEqual({
      kind: ATTACHMENT.missing,
      path: A_PICTURE,
    });
  });

  it("says a half-written file is empty rather than sending nothing", () => {
    expect(attachmentFor(facts({ bytes: 0 }))).toEqual({
      kind: ATTACHMENT.empty,
      path: A_PICTURE,
    });
  });

  it("refuses a file past what Telegram accepts, in the megabytes a person reads", () => {
    expect(attachmentFor(facts({ bytes: 51 * BYTES_PER_MEGABYTE }))).toEqual({
      kind: ATTACHMENT.tooBig,
      path: A_PICTURE,
      megabytes: 51,
    });
  });

  it("takes a file at exactly the limit, since the rule is larger-than", () => {
    expect(attachmentFor(facts({ bytes: 50 * BYTES_PER_MEGABYTE })).kind).toBe(ATTACHMENT.ready);
  });

  it("refuses on a channel that carries text only, whatever the file turns out to be", () => {
    expect(attachmentFor(facts({ channelCarriesPictures: false, bytes: null }))).toEqual({
      kind: ATTACHMENT.noChannel,
      path: A_PICTURE,
    });
  });
});

describe("nameIn", () => {
  it("reads a name off a Windows path", () => {
    expect(nameIn("D:\\work\\mockup.png")).toBe("mockup.png");
  });

  it("reads a name off a posix path", () => {
    expect(nameIn("/home/work/mockup.png")).toBe("mockup.png");
  });

  it("hands back a bare name unchanged", () => {
    expect(nameIn("mockup.png")).toBe("mockup.png");
  });

  it("survives a path that is nothing but separators", () => {
    expect(nameIn("//")).toBe("//");
  });
});

describe("wasAttached", () => {
  it("is true only for a picture that will actually go", () => {
    expect(wasAttached(attachmentFor(facts()))).toBe(true);
    expect(wasAttached(attachmentFor(facts({ bytes: null })))).toBe(false);
    expect(wasAttached(null)).toBe(false);
  });
});

describe("captionFits", () => {
  it("takes a message inside what Telegram allows on a caption", () => {
    expect(captionFits("x".repeat(CAPTION_LIMIT))).toBe(true);
  });

  it("refuses one past it, so a long ping is not swallowed by a 400", () => {
    expect(captionFits("x".repeat(CAPTION_LIMIT + 1))).toBe(false);
  });

  it("counts the markup it is handed, erring toward splitting rather than toward a 400", () => {
    const anyMarkup = "<mark></mark>";
    const nearlyFull = "x".repeat(CAPTION_LIMIT - anyMarkup.length);

    expect(captionFits(`<mark>${nearlyFull}</mark>`)).toBe(true);
    expect(captionFits(`<mark>${nearlyFull}x</mark>`)).toBe(false);
  });
});

describe("attachmentReport", () => {
  it("says nothing when no picture was asked for", () => {
    expect(attachmentReport(null)).toBe("");
  });

  it("says nothing when the picture is going", () => {
    expect(attachmentReport(attachmentFor(facts()))).toBe("");
  });

  it("names the path when there is nothing at it, so the model can fix its own call", () => {
    const said = attachmentReport(attachmentFor(facts({ bytes: null })));

    expect(said).toContain("nothing at");
    expect(said).toContain(A_PICTURE);
  });

  it("says what it is instead of a picture, and what to do about it", () => {
    const said = attachmentReport(attachmentFor(facts({ path: "/tmp/report.pdf" })));

    expect(said).toContain("report.pdf");
    expect(said).toContain("png, jpg, jpeg, gif, webp");
  });

  it("gives the size against the limit, both in megabytes", () => {
    const said = attachmentReport(attachmentFor(facts({ bytes: 51 * BYTES_PER_MEGABYTE })));

    expect(said).toContain("51 MB");
    expect(said).toContain("50 MB");
  });

  it("blames the relay rather than the file when the channel carries text only", () => {
    expect(attachmentReport(attachmentFor(facts({ channelCarriesPictures: false })))).toContain(
      "relay"
    );
  });

  it("says the file is empty rather than missing", () => {
    expect(attachmentReport(attachmentFor(facts({ bytes: 0 })))).toContain("empty");
  });

  it("carries whatever refused the picture, since the reason comes from outside", () => {
    const refused = refusedPicture(
      { kind: ATTACHMENT.ready, path: A_PICTURE, name: "mockup.png" },
      "the sky fell in"
    );

    expect(attachmentReport(refused)).toBe("The picture did not go: the sky fell in.");
  });
});
