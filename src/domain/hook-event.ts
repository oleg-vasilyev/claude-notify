export const HOOK_EVENT = {
  stop: "Stop",
  preToolUse: "PreToolUse",
  permissionRequest: "PermissionRequest",
  notification: "Notification",
  userPromptSubmit: "UserPromptSubmit",
} as const;

export const HOOK_EVENTS = Object.values(HOOK_EVENT);

export type HookEvent = (typeof HOOK_EVENT)[keyof typeof HOOK_EVENT];

export type HookPayload = {
  cwd?: string;
  tool_name?: string;
  message?: string;
  transcript_path?: string;
  session_id?: string;
  tool_use_id?: string;
  background_tasks?: unknown[];
  tool_input?: {
    questions?: {
      question?: string;
      options?: { label?: string; description?: string }[];
    }[];
  };
};

export const isHookEvent = (candidate: string): candidate is HookEvent =>
  (HOOK_EVENTS as readonly string[]).includes(candidate);
