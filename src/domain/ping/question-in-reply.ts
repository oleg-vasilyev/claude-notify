const CODE_BLOCK = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]*`/g;
const GUILLEMET_QUOTE = /«[^»\n]*»/g;
const STRAIGHT_QUOTE = /"[^"\n]*"/g;
const QUOTED_LINE = /^>.*$/gm;
const STANDS_FOR_A_QUOTATION = "x";
const QUESTION_SENTENCE = /[\p{L}\p{N}][*_)]*\?[?!]*(?=[\s*_)\]]|$)/u;

const withQuotationsAsWords = (reply: string): string =>
  reply
    .replace(CODE_BLOCK, " ")
    .replace(QUOTED_LINE, " ")
    .replace(INLINE_CODE, STANDS_FOR_A_QUOTATION)
    .replace(GUILLEMET_QUOTE, STANDS_FOR_A_QUOTATION)
    .replace(STRAIGHT_QUOTE, STANDS_FOR_A_QUOTATION);

export const replyAsksAQuestion = (lastReply: unknown): boolean =>
  typeof lastReply === "string" && QUESTION_SENTENCE.test(withQuotationsAsWords(lastReply));
