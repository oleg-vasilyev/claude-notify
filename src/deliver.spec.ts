import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachmentReport } from "#domain/ping/attachment.ts";
import { idleSeconds } from "#presence/idle-time.ts";
import { relayMessage } from "#relay/relay-client.ts";
import { readConfig, type Config } from "#state/config.ts";
import { readLastSent, writeLastSent } from "#state/last-sent.ts";
import { log } from "#state/log.ts";
import { appendPending } from "#state/pending-queue.ts";
import { pictureBytes, sendPicture } from "#telegram/picture.ts";
import { sendMessage } from "#telegram/telegram-api.ts";
import { rememberedUsage, rememberUsage } from "#state/last-usage.ts";
import { fetchUsage } from "#usage/usage-api.ts";
import { deliver } from "#app/deliver.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


vi.mock("#state/config.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#state/config.ts")>()),
  readConfig: vi.fn(),
}));
vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#presence/idle-time.ts", () => ({ idleSeconds: vi.fn() }));
vi.mock("#state/pending-queue.ts", () => ({ appendPending: vi.fn() }));
vi.mock("#state/last-sent.ts", () => ({ readLastSent: vi.fn(), writeLastSent: vi.fn() }));
vi.mock("#telegram/telegram-api.ts", () => ({ sendMessage: vi.fn() }));
vi.mock("#relay/relay-client.ts", () => ({ relayMessage: vi.fn() }));
vi.mock("#usage/usage-api.ts", () => ({ fetchUsage: vi.fn() }));
vi.mock("#state/last-usage.ts", () => ({ rememberUsage: vi.fn(), rememberedUsage: vi.fn() }));
vi.mock("#app/watcher-process.ts", () => ({
  startWatcher: vi.fn(),
  watcherIsRunning: vi.fn(),
}));
vi.mock("#telegram/picture.ts", () => ({ pictureBytes: vi.fn(), sendPicture: vi.fn() }));

const AWAY_SECONDS = 600;
const PRESENT_SECONDS = 5;

const config: Config = {
  delivery: { kind: "telegram", token: "T", chatId: "42" },
  machineLabel: "home",
  minIdleMinutes: 3,
  staleMinutes: 15,
  includeUsage: false,
  askMinutes: 10,
  quoteQuestions: true,
  hosting: null,
};

const throughARelay: Config = {
  ...config,
  machineLabel: "work",
  delivery: { kind: "relay", url: "http://home-laptop:8787", secret: "s3cr3t" },
};

const ping = { message: "[a-project] жду апрув", rateLimitMinutes: 0 };

const A_SMALL_PICTURE = 40_000;
const MOCKUP = "D:/work/mockup.png";
const withAPicture = { ...ping, imagePath: MOCKUP };

describe("deliver", () => {
  beforeEach(() => {
    vi.mocked(readConfig).mockReturnValue(config);
    vi.mocked(idleSeconds).mockReturnValue(AWAY_SECONDS);
    vi.mocked(readLastSent).mockReturnValue(null);
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "unavailable", why: "the endpoint answered 500" });
    vi.mocked(rememberedUsage).mockReturnValue(null);
    vi.mocked(watcherIsRunning).mockReturnValue(false);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(relayMessage).mockResolvedValue(undefined);
    vi.mocked(sendPicture).mockResolvedValue(undefined);
    vi.mocked(pictureBytes).mockReturnValue(A_SMALL_PICTURE);
    process.exitCode = undefined;
  });

  it("sends the ping once the user is away", async () => {
    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[a-project@home] жду апрув");
  });

  it("records what it said and when, so a queued repeat can be recognised", async () => {
    await deliver(ping);

    expect(writeLastSent).toHaveBeenCalledWith("a-project", {
      at: expect.any(Number),
      message: "[a-project@home] жду апрув",
    });
  });

  it("queues instead of sending while the user is at the keyboard", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver(ping);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(appendPending).toHaveBeenCalledWith({
      queuedAt: expect.any(Number),
      message: "[a-project@home] жду апрув",
      sessionId: null,
    });
  });

  it("queues the session with the ping, so the flush can ask whether it is waiting yet", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver({ ...ping, sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });

    expect(appendPending).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })
    );
  });

  it("reports that it reached the phone, so a caller can tell the difference", async () => {
    expect((await deliver(ping)).outcome).toEqual({ kind: "sent" });
  });

  it("reports the queue and how long the user has been idle", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    expect((await deliver(ping)).outcome).toEqual({
      kind: "queued",
      idleSeconds: PRESENT_SECONDS,
    });
  });

  it("reports the rate limit with the age of the stamp that caused it", async () => {
    const A_MINUTE = 60_000;

    vi.mocked(readLastSent).mockReturnValue({ at: Date.now() - A_MINUTE, message: "" });

    const { outcome } = await deliver({ ...ping, rateLimitMinutes: 10 });

    expect(outcome.kind).toBe("skipped");
    expect(outcome).toMatchObject({ sinceLastSentMinutes: expect.closeTo(1, 1) });
  });

  it("reports a failed send with the reason, rather than swallowing it", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("Telegram refused with 404"));

    expect((await deliver(ping)).outcome).toEqual({
      kind: "failed",
      why: "Error: Telegram refused with 404",
    });
  });

  it("reports an unconfigured machine instead of pretending it sent something", async () => {
    vi.mocked(readConfig).mockReturnValue(null);

    expect((await deliver(ping)).outcome).toEqual({ kind: "unconfigured" });
  });

  it("starts a watcher for the queued ping", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver(ping);

    expect(startWatcher).toHaveBeenCalled();
  });

  it("leaves the running watcher alone rather than starting a second", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);
    vi.mocked(watcherIsRunning).mockReturnValue(true);

    await deliver(ping);

    expect(startWatcher).not.toHaveBeenCalled();
  });

  it("ignores presence when the caller asks for delivery now", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver({ ...ping, ignorePresence: true });

    expect(sendMessage).toHaveBeenCalled();
  });

  it("skips a rate-limited fallback", async () => {
    vi.mocked(readLastSent).mockReturnValue({ at: Date.now(), message: "" });

    await deliver({ ...ping, rateLimitMinutes: 10 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
  });

  it("appends the limits line when usage is switched on", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "read", snapshot: { limits: [{ group: "session", percent: 33 }] } });

    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith(
      "T",
      "42",
      "[a-project@home] жду апрув\n\n<blockquote><code>5-hour  ━━━───────   33%</code></blockquote>"
    );
  });

  it("still sends the ping when the limits could not be read", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "unavailable", why: "the endpoint answered 500" });

    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[a-project@home] жду апрув");
    expect(log).toHaveBeenCalledWith("WARN usage unavailable: the endpoint answered 500");
  });

  it("names why the limits were missing, since one line is all the debugging there is", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({
      kind: "unavailable",
      why: "TimeoutError: The operation was aborted due to timeout",
    });

    await deliver(ping);

    expect(log).toHaveBeenCalledWith(
      "WARN usage unavailable: TimeoutError: The operation was aborted due to timeout"
    );
  });

  it("says so when the endpoint answered but named no windows at all", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "read", snapshot: { limits: [] } });

    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[a-project@home] жду апрув");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("named no limit windows"));
  });

  it("keeps the reading, so a later ping has something to fall back on", async () => {
    const snapshot = { limits: [{ group: "session", percent: 33 }] };
    const before = Date.now();

    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "read", snapshot });

    await deliver(ping);

    const kept = vi.mocked(rememberUsage).mock.calls[0];

    expect(kept?.[0]).toBe(snapshot);
    expect(kept?.[1]).toBeGreaterThanOrEqual(before);
    expect(kept?.[1]).toBeLessThanOrEqual(Date.now());
  });

  it("shows the last reading with its age when the endpoint refuses", async () => {
    const A_MINUTE = 60_000;

    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "unavailable", why: "the endpoint answered 401" });
    vi.mocked(rememberedUsage).mockReturnValue({
      snapshot: { limits: [{ group: "weekly", percent: 40 }] },
      readAt: Date.now() - 40 * A_MINUTE,
    });

    await deliver(ping);

    const sent = vi.mocked(sendMessage).mock.calls[0]?.[2] ?? "";

    expect(sent).toContain("40%");
    expect(sent).toContain("40m old");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("from a snapshot 40m old"));
  });

  it("shows nothing rather than a reading too old to mean anything", async () => {
    const A_DAY = 24 * 60 * 60_000;

    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ kind: "unavailable", why: "the endpoint answered 401" });
    vi.mocked(rememberedUsage).mockReturnValue({
      snapshot: { limits: [{ group: "weekly", percent: 40 }] },
      readAt: Date.now() - 3 * A_DAY,
    });

    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[a-project@home] жду апрув");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("too old to show"));
  });

  it("never asks for usage when it is switched off", async () => {
    await deliver(ping);

    expect(fetchUsage).not.toHaveBeenCalled();
  });

  it("reports a refused send rather than throwing at the hook", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("429"));

    await deliver(ping);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("ERROR send failed"));
    expect(process.exitCode).toBe(1);
  });

  it("hands the ping to the relay on a machine that cannot reach Telegram", async () => {
    vi.mocked(readConfig).mockReturnValue(throughARelay);

    await deliver(ping);

    expect(relayMessage).toHaveBeenCalledWith(
      "http://home-laptop:8787",
      "s3cr3t",
      "[a-project@work] жду апрув"
    );
  });

  it("never touches Telegram itself once a relay is configured", async () => {
    vi.mocked(readConfig).mockReturnValue(throughARelay);

    await deliver(ping);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("says in the log which way a ping left, since only one of them can be at fault", async () => {
    vi.mocked(readConfig).mockReturnValue(throughARelay);

    await deliver(ping);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("SENT via relay"));
  });

  it("holds a relayed ping back while the user is at the keyboard, exactly as a direct one", async () => {
    vi.mocked(readConfig).mockReturnValue(throughARelay);
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver(ping);

    expect(relayMessage).not.toHaveBeenCalled();
    expect(appendPending).toHaveBeenCalled();
  });

  it("reports a relay that refused rather than throwing at the hook", async () => {
    vi.mocked(readConfig).mockReturnValue(throughARelay);
    vi.mocked(relayMessage).mockRejectedValue(new Error("401"));

    await deliver(ping);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("ERROR send failed"));
    expect(process.exitCode).toBe(1);
  });

  it("does nothing at all before setup has written the settings", async () => {
    vi.mocked(readConfig).mockReturnValue(null);

    await deliver(ping);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
  });

  it("sends a picture with the message as its caption, so one buzz carries both", async () => {
    await deliver(withAPicture);

    expect(sendPicture).toHaveBeenCalledWith(
      "T",
      "42",
      { kind: "ready", path: MOCKUP, name: "mockup.png" },
      "[a-project@home] жду апрув"
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends the picture even while the user sits at the keyboard, since that is the point", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver(withAPicture);

    expect(sendPicture).toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
  });

  it("splits the message off when it is too long to ride as a caption", async () => {
    const CAPTION_LIMIT = 1024;

    await deliver({ ...withAPicture, message: `[a-project] ${"я".repeat(CAPTION_LIMIT)}` });

    expect(sendMessage).toHaveBeenCalled();
    expect(sendPicture).toHaveBeenCalledWith("T", "42", expect.anything(), "");
  });

  it("still sends the words when the picture is not there, and says why it did not go", async () => {
    vi.mocked(pictureBytes).mockReturnValue(null);

    const { picture } = await deliver(withAPicture);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[a-project@home] жду апрув");
    expect(sendPicture).not.toHaveBeenCalled();
    expect(picture).toEqual({ kind: "missing", path: MOCKUP });
    expect(
      vi.mocked(log).mock.calls.filter(([line]) => line.includes("The picture did not go"))
    ).toHaveLength(1);
  });

  it("queues a ping whose picture never made it, since only a picture goes out now", async () => {
    vi.mocked(pictureBytes).mockReturnValue(null);
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    const { outcome, picture } = await deliver(withAPicture);

    expect(outcome.kind).toBe("queued");
    expect(picture?.kind).toBe("missing");
  });

  it("refuses a picture on a machine that forwards through a relay", async () => {
    vi.mocked(readConfig).mockReturnValue(throughARelay);

    const { picture } = await deliver(withAPicture);

    expect(picture).toEqual({ kind: "no-channel", path: MOCKUP });
    expect(relayMessage).toHaveBeenCalled();
    expect(sendPicture).not.toHaveBeenCalled();
  });

  it("names the picture in the log line, so a send can be told from a plain ping", async () => {
    await deliver(withAPicture);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("picture mockup.png"));
  });

  it("keeps the words when only the second half fails, so the model does not send them twice", async () => {
    const CAPTION_LIMIT = 1024;

    vi.mocked(sendPicture).mockRejectedValue(new Error("Telegram refused the picture with 413"));

    const { outcome, picture } = await deliver({
      ...withAPicture,
      message: `[a-project] ${"я".repeat(CAPTION_LIMIT)}`,
    });

    expect(outcome).toEqual({ kind: "sent" });
    expect(picture?.kind).toBe("refused");
    expect(attachmentReport(picture)).toContain("Do not send the words again");
    expect(writeLastSent).toHaveBeenCalled();
  });

  it("fails the whole ping when the one message carrying both was refused", async () => {
    vi.mocked(sendPicture).mockRejectedValue(new Error("Telegram refused the picture with 413"));

    const { outcome } = await deliver(withAPicture);

    expect(outcome.kind).toBe("failed");
    expect(writeLastSent).not.toHaveBeenCalled();
  });

  it("says the picture went nowhere when the rate limit swallowed the ping under it", async () => {
    vi.mocked(readLastSent).mockReturnValue({ at: Date.now(), message: "" });

    const { outcome, picture } = await deliver({ ...withAPicture, rateLimitMinutes: 10 });

    expect(outcome.kind).toBe("skipped");
    expect(attachmentReport(picture)).toContain("rate limit");
  });

  it("leaves a ping with no picture asking for nothing", async () => {
    const { picture } = await deliver(ping);

    expect(picture).toBeNull();
    expect(pictureBytes).not.toHaveBeenCalled();
  });
});
