// Shared by the question form (client) and /api/agent (server).

export const MAX_QUESTION_LENGTH = 500;

export type QuestionValidation =
  | { ok: true; question: string }
  | { ok: false; error: string };

export function validateQuestion(input: unknown): QuestionValidation {
  if (typeof input !== "string") {
    return { ok: false, error: "Please enter a question." };
  }
  const question = input.trim();
  if (!question) {
    return { ok: false, error: "Please enter a question." };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      error: `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, question };
}
