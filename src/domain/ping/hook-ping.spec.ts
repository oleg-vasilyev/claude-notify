import { describe, expect, it } from "vitest";

import { isHookEvent, type HookPayload } from "#domain/hook-event.ts";
import {
  endlessWork,
  monitorsIn,
  nobodyIsWatching,
  pingFor as maybePing,
  unfamiliarWork,
  willCarryOn,
  type HookPing,
} from "#domain/ping/hook-ping.ts";
import type { HookEvent } from "#domain/hook-event.ts";


const pingFor = (event: HookEvent, payload: HookPayload, quoting: boolean): HookPing => {
  const ping = maybePing(event, payload, quoting);

  if (ping === null) {
    throw new Error(`${event} was expected to say something`);
  }

  return ping;
};


const inProject: HookPayload = { cwd: "D:\\Temp\\another-project" };
const QUOTING = true;
const KEEPING_IT_HERE = false;

const asked: HookPayload = {
  ...inProject,
  tool_name: "AskUserQuestion",
  tool_input: { questions: [{ question: "Каким делать репозиторий?" }] },
};

describe("isHookEvent", () => {
  it("accepts an event the installer registers", () => {
    expect(isHookEvent("PermissionRequest")).toBe(true);
  });

  it("rejects anything else, so a typo in a hook registration cannot ping nonsense", () => {
    expect(isHookEvent("Whatever")).toBe(false);
  });
});

describe("nobodyIsWatching", () => {
  it("recognises a session a script is running, whichever SDK runs it", () => {
    expect(nobodyIsWatching("sdk-cli")).toBe(true);
    expect(nobodyIsWatching("sdk-ts")).toBe(true);
    expect(nobodyIsWatching("sdk-py")).toBe(true);
  });

  it("leaves the desktop app alone", () => {
    expect(nobodyIsWatching("claude-desktop")).toBe(false);
  });

  it("pings for an entrypoint it has never heard of, since a swallowed ping costs hours", () => {
    expect(nobodyIsWatching("some-new-host")).toBe(false);
    expect(nobodyIsWatching(undefined)).toBe(false);
    expect(nobodyIsWatching("")).toBe(false);
  });

  it("does not mistake an entrypoint that merely mentions an sdk", () => {
    expect(nobodyIsWatching("desktop-sdk-bridge")).toBe(false);
  });
});

describe("pingFor", () => {
  it("says nothing when the user submits a prompt — that event only records that work resumed", () => {
    expect(maybePing("UserPromptSubmit", inProject, QUOTING)).toBeNull();
  });

  it("says the turn failed, and why, when an API error ended it", () => {
    expect(pingFor("StopFailure", { ...inProject, error: "rate_limit" }, QUOTING).message).toBe(
      "[another-project] ход упал с ошибкой: rate_limit"
    );
  });

  it("still says the turn failed when the payload gave no usable reason", () => {
    expect(pingFor("StopFailure", { ...inProject, error: "" }, QUOTING).message).toBe(
      "[another-project] ход упал с ошибкой"
    );
    expect(pingFor("StopFailure", { ...inProject, error: { code: 529 } }, QUOTING).message).toBe(
      "[another-project] ход упал с ошибкой"
    );
  });

  it("shortens a failure reason that would not fit a notification", () => {
    const LONGEST_FAILURE_REASON = 120;
    const rambling = "x".repeat(LONGEST_FAILURE_REASON + 1);
    const message = pingFor("StopFailure", { error: rambling }, QUOTING).message;

    expect(message).toBe(`ход упал с ошибкой: ${"x".repeat(LONGEST_FAILURE_REASON - 1)}…`);
  });

  it("keeps a failure reason that just fits", () => {
    const LONGEST_FAILURE_REASON = 120;
    const exact = "x".repeat(LONGEST_FAILURE_REASON);

    expect(pingFor("StopFailure", { error: exact }, QUOTING).message).toBe(`ход упал с ошибкой: ${exact}`);
  });

  it("rate-limits a failed turn like a turn end, since errors come in bursts", () => {
    expect(pingFor("StopFailure", inProject, QUOTING).rateLimitMinutes).toBe(10);
  });

  it("says the turn ended", () => {
    expect(pingFor("Stop", inProject, QUOTING).message).toBe("[another-project] закончил ход, ждёт тебя");
  });

  it("rate-limits the turn-end fallback so a burst collapses", () => {
    expect(pingFor("Stop", inProject, QUOTING).rateLimitMinutes).toBe(10);
  });

  it("quotes the question itself", () => {
    const payload: HookPayload = {
      ...inProject,
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Каким делать репозиторий?" }] },
    };

    expect(pingFor("PreToolUse", payload, QUOTING).message).toBe(
      "[another-project] вопрос: Каким делать репозиторий?"
    );
  });

  it("lets a question through sooner than a fallback, because it is worth more", () => {
    expect(pingFor("PreToolUse", inProject, QUOTING).rateLimitMinutes).toBe(2);
  });

  it("shortens a question that would not fit a notification", () => {
    const payload: HookPayload = {
      ...inProject,
      tool_input: { questions: [{ question: "я".repeat(400) }] },
    };

    const { message } = pingFor("PreToolUse", payload, QUOTING);

    expect(message.length).toBeLessThanOrEqual("[another-project] ".length + 180);
    expect(message.endsWith("…")).toBe(true);
  });

  it("leaves a question that just fits unshortened", () => {
    const asked = "я".repeat(180 - "вопрос: ".length);
    const payload: HookPayload = { ...inProject, tool_input: { questions: [{ question: asked }] } };

    expect(pingFor("PreToolUse", payload, QUOTING).message.endsWith("…")).toBe(false);
  });

  it("announces a plan waiting for approval", () => {
    const payload: HookPayload = { ...inProject, tool_name: "ExitPlanMode" };

    expect(pingFor("PreToolUse", payload, QUOTING).message).toBe("[another-project] план готов, жду апрув");
  });

  it("falls back when a question tool carried no question", () => {
    const payload: HookPayload = { ...inProject, tool_input: { questions: [] } };

    expect(pingFor("PreToolUse", payload, QUOTING).message).toBe("[another-project] ждёт твоего ответа");
  });

  it("names the tool asking for permission", () => {
    const payload: HookPayload = { ...inProject, tool_name: "Bash" };

    expect(pingFor("PermissionRequest", payload, QUOTING).message).toBe(
      "[another-project] просит разрешение: Bash"
    );
  });

  it("still says something when the permission payload named no tool", () => {
    expect(pingFor("PermissionRequest", inProject, QUOTING).message).toBe(
      "[another-project] просит разрешение: инструмент"
    );
  });

  it("passes through what a notification says", () => {
    const payload: HookPayload = { ...inProject, message: "нужно решение" };

    expect(pingFor("Notification", payload, QUOTING).message).toBe("[another-project] нужно решение");
  });

  it("works without a working directory, which is all a payload really guarantees", () => {
    expect(pingFor("Stop", {}, QUOTING).message).toBe("закончил ход, ждёт тебя");
  });

  it("keeps the question to itself on a machine that does not quote", () => {
    expect(pingFor("PreToolUse", asked, KEEPING_IT_HERE).message).toBe(
      "[another-project] ждёт твоего ответа"
    );
  });

  it("still announces a waiting plan when not quoting, since that names nothing", () => {
    const payload: HookPayload = { ...inProject, tool_name: "ExitPlanMode" };

    expect(pingFor("PreToolUse", payload, KEEPING_IT_HERE).message).toBe(
      "[another-project] план готов, жду апрув"
    );
  });

  it("still names the tool wanting a permission, which carries no work of its own", () => {
    const payload: HookPayload = { ...inProject, tool_name: "Bash" };

    expect(pingFor("PermissionRequest", payload, KEEPING_IT_HERE).message).toBe(
      "[another-project] просит разрешение: Bash"
    );
  });

  it("says the turn ended whether or not it quotes", () => {
    expect(pingFor("Stop", inProject, KEEPING_IT_HERE).message).toBe(
      "[another-project] закончил ход, ждёт тебя"
    );
  });
});

describe("willCarryOn", () => {
  const AGENT = { type: "subagent", status: "running" };
  const COMMAND = { type: "shell", status: "running" };
  const WATCHER = { type: "monitor", status: "running", server: "an-mcp-server", tool: "subscribe" };
  const MONITOR_TOOL = {
    type: "shell",
    status: "running",
    description: "the gate's verdict",
    command: 'tail -n +1 -F logs/gate.log | grep --line-buffered "^verdict:"',
  };

  it("is true while a subagent runs, since it will hand the turn back itself", () => {
    expect(willCarryOn("Stop", { background_tasks: [AGENT] })).toBe(true);
  });

  it("is true while a background command runs, for the same reason", () => {
    expect(willCarryOn("Stop", { background_tasks: [COMMAND] })).toBe(true);
  });

  it("is true while the Monitor tool follows a log, which arrives as a shell and wakes the agent", () => {
    expect(willCarryOn("Stop", { background_tasks: [MONITOR_TOOL] })).toBe(true);
  });

  it("is false for a monitor, which stays armed and hands nothing back", () => {
    expect(willCarryOn("Stop", { background_tasks: [WATCHER] })).toBe(false);
  });

  it("is false for a monitor whatever server it names, or none", () => {
    const { server: _none, ...unnamed } = WATCHER;

    expect(willCarryOn("Stop", { background_tasks: [unnamed] })).toBe(false);
  });

  it("is false for a kind nobody has measured, so an unknown task pings rather than silences", () => {
    expect(willCarryOn("Stop", { background_tasks: [{ type: "seance", status: "running" }] })).toBe(
      false
    );
  });

  it("is false for work that has stopped running, whatever kind it was", () => {
    expect(willCarryOn("Stop", { background_tasks: [{ ...AGENT, status: "completed" }] })).toBe(
      false
    );
  });

  it("is false for a task that names no status at all", () => {
    expect(willCarryOn("Stop", { background_tasks: [{ type: "subagent" }] })).toBe(false);
  });

  it("is false once nothing is running, which is the turn that really waits on the user", () => {
    expect(willCarryOn("Stop", { background_tasks: [] })).toBe(false);
  });

  it("is false for a payload that never mentioned background work", () => {
    expect(willCarryOn("Stop", {})).toBe(false);
  });

  it("pings rather than dying when a task is not an object at all", () => {
    expect(willCarryOn("Stop", { background_tasks: [null, 7, "busy"] })).toBe(false);
  });

  it("pings rather than dying when the field is not even a list", () => {
    expect(willCarryOn("Stop", { background_tasks: { running: true } })).toBe(false);
  });

  it("does not hold a turn that ended on a question, since an agent still running does not answer it", () => {
    expect(
      willCarryOn("Stop", { background_tasks: [AGENT], last_assistant_message: "Пока агент пишет спеки: делаем фазу?" })
    ).toBe(false);
  });

  it("still holds a turn that ended on a statement while an agent runs", () => {
    expect(
      willCarryOn("Stop", { background_tasks: [AGENT], last_assistant_message: "Агент пишет спеки. Жду его." })
    ).toBe(true);
  });

  it("looks past a monitor to the agent behind it, rather than judging the first task", () => {
    expect(willCarryOn("Stop", { background_tasks: [WATCHER, AGENT] })).toBe(true);
  });

  it("says nothing about a question, which waits on the user whatever else is running", () => {
    expect(willCarryOn("PreToolUse", { background_tasks: [AGENT] })).toBe(false);
  });

  it("says nothing about a turn that failed, which nothing will resume", () => {
    expect(willCarryOn("StopFailure", { background_tasks: [AGENT] })).toBe(false);
  });

  describe("a background command that never exits", () => {
    const SERVER = { ...COMMAND, command: "pnpm dev" };

    it("does not hold the turn for a server, which hands nothing back", () => {
      expect(willCarryOn("Stop", { background_tasks: [SERVER] })).toBe(false);
    });

    it("still holds the turn for a command that exits", () => {
      expect(willCarryOn("Stop", { background_tasks: [{ ...COMMAND, command: "npm run check" }] })).toBe(
        true
      );
    });

    it("judges a shell by its command alone, never by the prose describing it", () => {
      expect(
        willCarryOn("Stop", {
          background_tasks: [{ ...COMMAND, command: "npx playwright test", description: "Test against the dev server" }],
        })
      ).toBe(true);
    });

    it("judges only a shell by its command, since an agent is not one", () => {
      expect(willCarryOn("Stop", { background_tasks: [{ ...AGENT, command: "pnpm dev" }] })).toBe(true);
    });

    it("still holds the turn for an agent running beside a server", () => {
      expect(willCarryOn("Stop", { background_tasks: [SERVER, AGENT] })).toBe(true);
    });

    it("holds the turn for a shell whose command is not a string, rather than dying", () => {
      expect(willCarryOn("Stop", { background_tasks: [{ ...COMMAND, command: 7 }] })).toBe(true);
    });
  });

  it("says nothing about a permission, for the same reason", () => {
    expect(willCarryOn("PermissionRequest", { background_tasks: [AGENT] })).toBe(false);
  });
});

describe("unfamiliarWork", () => {
  it("names a kind nobody has measured, so a fourth one is not invisible", () => {
    expect(unfamiliarWork({ background_tasks: [{ type: "seance", status: "running" }] })).toEqual([
      "seance/running",
    ]);
  });

  it("says nothing about work that was judged — counted, or a watcher deliberately not counted", () => {
    expect(
      unfamiliarWork({
        background_tasks: [
          { type: "shell", status: "running" },
          { type: "monitor", status: "running" },
          { type: "monitor", status: "whatever a watcher does" },
        ],
      })
    ).toEqual([]);
  });

  it("names a known kind in a status nobody has measured, since that is the half that guesses", () => {
    expect(
      unfamiliarWork({ background_tasks: [{ type: "subagent", status: "pending" }] })
    ).toEqual(["subagent/pending"]);
  });

  it("names a task that is not an object, rather than dropping it", () => {
    expect(unfamiliarWork({ background_tasks: [null] })).toEqual(["/"]);
  });

  it("says nothing when the field is not a list", () => {
    expect(unfamiliarWork({ background_tasks: "busy" })).toEqual([]);
  });

  it("names each kind once, however many of them were running", () => {
    expect(
      unfamiliarWork({
        background_tasks: [
          { type: "seance", status: "running" },
          { type: "seance", status: "running" },
          { type: "ouija", status: "waiting" },
        ],
      })
    ).toEqual(["seance/running", "ouija/waiting"]);
  });

  it("stands in for a missing field rather than dropping the task", () => {
    expect(unfamiliarWork({ background_tasks: [{}] })).toEqual(["/"]);
  });

  it("says nothing when there was no background work at all", () => {
    expect(unfamiliarWork({})).toEqual([]);
  });

  it("says nothing about a server, which was judged and deliberately not counted", () => {
    expect(
      unfamiliarWork({ background_tasks: [{ type: "shell", status: "running", command: "pnpm dev" }] })
    ).toEqual([]);
  });

  it("names a server that has stopped, the same as any shell that has", () => {
    expect(
      unfamiliarWork({ background_tasks: [{ type: "shell", status: "completed", command: "pnpm dev" }] })
    ).toEqual(["shell/completed"]);
  });
});

describe("monitorsIn", () => {
  it("names each monitor's server, status and description, so its shape can be measured", () => {
    expect(
      monitorsIn({
        background_tasks: [
          { type: "monitor", status: "running", server: "an-mcp-server", description: "live updates" },
          { type: "monitor", status: "running", description: "page edits" },
        ],
      })
    ).toEqual(["an-mcp-server | running | live updates", "no server | running | page edits"]);
  });

  it("stands in for fields that are missing or not text", () => {
    expect(monitorsIn({ background_tasks: [{ type: "monitor", description: 7 }] })).toEqual([
      "no server | no status | ",
    ]);
  });

  it("reads an empty server, or one that is not text, as no server", () => {
    expect(
      monitorsIn({
        background_tasks: [
          { type: "monitor", status: "running", server: "", description: "a" },
          { type: "monitor", status: "running", server: 7, description: "b" },
        ],
      })
    ).toEqual(["no server | running | a", "no server | running | b"]);
  });

  it("names nothing but monitors", () => {
    expect(
      monitorsIn({ background_tasks: [{ type: "shell", status: "running", description: "a build" }] })
    ).toEqual([]);
  });

  it("says nothing when there was no background work at all", () => {
    expect(monitorsIn({})).toEqual([]);
  });
});

describe("endlessWork", () => {
  it("names a running server by its command, so the log shows what stopped holding the turn", () => {
    expect(
      endlessWork({
        background_tasks: [
          { type: "shell", status: "running", command: "pnpm dev", description: "Start the dev server" },
        ],
      })
    ).toEqual(["pnpm dev"]);
  });

  it("names nothing for a shell that came without a command", () => {
    expect(
      endlessWork({
        background_tasks: [{ type: "shell", status: "running", description: "Start the dev server" }],
      })
    ).toEqual([]);
  });

  it("leaves out a server that has stopped, every command that exits, and anything not a shell", () => {
    expect(
      endlessWork({
        background_tasks: [
          { type: "shell", status: "completed", command: "pnpm dev" },
          { type: "shell", status: "running", command: "npm run check" },
          { type: "subagent", status: "running", command: "pnpm dev" },
        ],
      })
    ).toEqual([]);
  });

  it("says nothing when there was no background work at all", () => {
    expect(endlessWork({})).toEqual([]);
  });
});
