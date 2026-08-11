import { copy, recognise } from "#domain/copy.ru.ts";
import { HOOK_EVENT, type HookEvent, type HookPayload } from "#domain/hook-event.ts";


const ASK_TOOL = "AskUserQuestion";
const LONGEST_ASKED = 500;
const LONGEST_LABEL = 60;
const ELLIPSIS = "…";
const FIRST = 0;

export const ALLOW = "allow";
export const DENY = "deny";

export const QUESTION_KIND = {
  choice: "choice",
  permission: "permission",
} as const;

export type QuestionKind = (typeof QUESTION_KIND)[keyof typeof QUESTION_KIND];

export type QuestionOption = {
  value: string;
  label: string;
  recommended: boolean;
};

export type AskedQuestion = {
  id: string;
  kind: QuestionKind;
  text: string;
  options: QuestionOption[];
};

const shortened = (text: string, longest: number): string =>
  text.length <= longest ? text : `${text.slice(0, longest - ELLIPSIS.length)}${ELLIPSIS}`;

const isRecommended = (description: string): boolean => {
  const lowered = description.toLowerCase();

  return recognise.recommendedMarks.some((mark) => lowered.includes(mark));
};

const choiceOptions = (
  written: { label?: string; description?: string }[]
): QuestionOption[] =>
  written.flatMap((option, index) => {
    if (option.label === undefined || option.label === "") {
      return [];
    }

    return [
      {
        value: `${index}`,
        label: shortened(option.label, LONGEST_LABEL),
        recommended: isRecommended(option.description ?? ""),
      },
    ];
  });

const permissionOptions = (): QuestionOption[] => [
  { value: ALLOW, label: copy.allowButton, recommended: false },
  { value: DENY, label: copy.denyButton, recommended: false },
];

export const ownsAskUserQuestion = (event: HookEvent, payload: HookPayload): boolean =>
  event === HOOK_EVENT.preToolUse && payload.tool_name === ASK_TOOL;

export const questionFrom = (
  event: HookEvent,
  payload: HookPayload,
  id: string
): AskedQuestion | null => {
  if (ownsAskUserQuestion(event, payload)) {
    const asked = payload.tool_input?.questions?.[FIRST];
    const text = asked?.question;

    if (text === undefined || text === "") {
      return null;
    }

    const options = choiceOptions(asked?.options ?? []);

    if (options.length === 0) {
      return null;
    }

    return { id, kind: QUESTION_KIND.choice, text: shortened(text, LONGEST_ASKED), options };
  }

  if (event === HOOK_EVENT.permissionRequest && payload.tool_name !== ASK_TOOL) {
    return {
      id,
      kind: QUESTION_KIND.permission,
      text: copy.permissionWanted(payload.tool_name ?? copy.someTool),
      options: permissionOptions(),
    };
  }

  return null;
};

export const questionText = (question: AskedQuestion, project: string): string => {
  const lines = [project + question.text];

  if (question.kind === QUESTION_KIND.choice) {
    lines.push("");

    for (const option of question.options) {
      lines.push(option.recommended ? copy.recommendedOption(option.label) : `• ${option.label}`);
    }

    lines.push("", copy.answerFromPhoneHint);
  }

  return lines.join("\n");
};
