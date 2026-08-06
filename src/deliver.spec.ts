import { beforeEach, describe, expect, it, vi } from "vitest";

import { idleSeconds } from "#presence/idle-time.ts";
import { readConfig, type Config } from "#state/config.ts";
import { readLastSentAt, writeLastSentAt } from "#state/last-sent.ts";
import { log } from "#state/log.ts";
import { appendPending } from "#state/pending-queue.ts";
import { sendMessage } from "#telegram/telegram-api.ts";
import { fetchUsage } from "#usage/usage-api.ts";
import { deliver } from "#app/deliver.ts";
import { startWatcher, watcherIsRunning } from "#app/watcher-process.ts";


vi.mock("#state/config.ts", () => ({ readConfig: vi.fn() }));
vi.mock("#state/log.ts", () => ({ log: vi.fn() }));
vi.mock("#presence/idle-time.ts", () => ({ idleSeconds: vi.fn() }));
vi.mock("#state/pending-queue.ts", () => ({ appendPending: vi.fn() }));
vi.mock("#state/last-sent.ts", () => ({ readLastSentAt: vi.fn(), writeLastSentAt: vi.fn() }));
vi.mock("#telegram/telegram-api.ts", () => ({ sendMessage: vi.fn() }));
vi.mock("#usage/usage-api.ts", () => ({ fetchUsage: vi.fn() }));
vi.mock("#app/watcher-process.ts", () => ({
  startWatcher: vi.fn(),
  watcherIsRunning: vi.fn(),
}));

const AWAY_SECONDS = 600;
const PRESENT_SECONDS = 5;

const config: Config = {
  token: "T",
  chatId: "42",
  machineLabel: "home",
  minIdleMinutes: 3,
  staleMinutes: 15,
  includeUsage: false,
};

const ping = { message: "[job-finder] жду апрув", rateLimitMinutes: 0 };

describe("deliver", () => {
  beforeEach(() => {
    vi.mocked(readConfig).mockReturnValue(config);
    vi.mocked(idleSeconds).mockReturnValue(AWAY_SECONDS);
    vi.mocked(readLastSentAt).mockReturnValue(null);
    vi.mocked(fetchUsage).mockResolvedValue(null);
    vi.mocked(watcherIsRunning).mockReturnValue(false);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    process.exitCode = undefined;
  });

  it("sends the ping once the user is away", async () => {
    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[job-finder@home] жду апрув");
  });

  it("stamps the project it just pinged, so the next fallback can be rate-limited", async () => {
    await deliver(ping);

    expect(writeLastSentAt).toHaveBeenCalledWith("job-finder", expect.any(Number));
  });

  it("queues instead of sending while the user is at the keyboard", async () => {
    vi.mocked(idleSeconds).mockReturnValue(PRESENT_SECONDS);

    await deliver(ping);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(appendPending).toHaveBeenCalledWith({
      queuedAt: expect.any(Number),
      message: "[job-finder@home] жду апрув",
    });
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
    vi.mocked(readLastSentAt).mockReturnValue(Date.now());

    await deliver({ ...ping, rateLimitMinutes: 10 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
  });

  it("appends the limits line when usage is switched on", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue({ limits: [{ group: "session", percent: 33 }] });

    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[job-finder@home] жду апрув\n5ч 33%");
  });

  it("still sends the ping when the limits could not be read", async () => {
    vi.mocked(readConfig).mockReturnValue({ ...config, includeUsage: true });
    vi.mocked(fetchUsage).mockResolvedValue(null);

    await deliver(ping);

    expect(sendMessage).toHaveBeenCalledWith("T", "42", "[job-finder@home] жду апрув");
    expect(log).toHaveBeenCalledWith("WARN usage unavailable");
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

  it("does nothing at all before setup has written the settings", async () => {
    vi.mocked(readConfig).mockReturnValue(null);

    await deliver(ping);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
  });
});
