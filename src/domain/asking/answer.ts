import { QUESTION_KIND, type AskedQuestion } from "#domain/asking/question.ts";


const SEPARATOR = ":";
const ID_PART = 0;
const VALUE_PART = 1;
const PARTS = 2;
const ONLY_ONE = 1;

export type TelegramUpdate = {
  update_id?: number;
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number } };
  };
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

export type ReceivedAnswer = {
  said: string;
  chosenValue: string | null;
  callbackId: string | null;
};

export type MatchedAnswer = {
  id: string;
  answer: ReceivedAnswer;
};

export const callbackDataFor = (questionId: string, value: string): string =>
  `${questionId}${SEPARATOR}${value}`;

export const highestUpdateId = (updates: readonly TelegramUpdate[]): number | null => {
  let highest: number | null = null;

  for (const update of updates) {
    if (update.update_id !== undefined && (highest === null || update.update_id > highest)) {
      highest = update.update_id;
    }
  }

  return highest;
};

const fromThisChat = (id: number | undefined, chatId: string): boolean =>
  id !== undefined && `${id}` === chatId;

const pressedButton = (
  update: TelegramUpdate,
  questions: readonly AskedQuestion[],
  chatId: string
): MatchedAnswer | null => {
  const callback = update.callback_query;

  if (callback?.data === undefined || !fromThisChat(callback.message?.chat?.id, chatId)) {
    return null;
  }

  const parts = callback.data.split(SEPARATOR);

  if (parts.length !== PARTS) {
    return null;
  }

  const question = questions.find((candidate) => candidate.id === parts[ID_PART]);
  const picked = question?.options.find((option) => option.value === parts[VALUE_PART]);

  if (question === undefined || picked === undefined) {
    return null;
  }

  return {
    id: question.id,
    answer: {
      said: picked.label,
      chosenValue: picked.value,
      callbackId: callback.id ?? null,
    },
  };
};

const wroteWords = (
  update: TelegramUpdate,
  questions: readonly AskedQuestion[],
  chatId: string
): MatchedAnswer | null => {
  const written = update.message?.text?.trim();

  if (
    written === undefined ||
    written === "" ||
    !fromThisChat(update.message?.chat?.id, chatId)
  ) {
    return null;
  }

  const answerable = questions.filter((question) => question.kind === QUESTION_KIND.choice);
  const only = answerable[0];

  if (answerable.length !== ONLY_ONE || only === undefined) {
    return null;
  }

  return { id: only.id, answer: { said: written, chosenValue: null, callbackId: null } };
};

export const answersIn = (
  updates: readonly TelegramUpdate[],
  questions: readonly AskedQuestion[],
  chatId: string
): MatchedAnswer[] => {
  const matched: MatchedAnswer[] = [];
  const taken = new Set<string>();

  for (const update of updates) {
    const found =
      pressedButton(update, questions, chatId) ?? wroteWords(update, questions, chatId);

    if (found !== null && !taken.has(found.id)) {
      taken.add(found.id);
      matched.push(found);
    }
  }

  return matched;
};
