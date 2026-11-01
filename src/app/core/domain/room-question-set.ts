import { QuestionSolution, QuizQuestion } from './quiz-question';

/** Host-authored content is private to one room; it never modifies a published quiz. */
export interface RoomQuestionSet {
  readonly questions: readonly QuizQuestion[];
  readonly solutions: readonly QuestionSolution[];
  readonly reviewed: boolean;
  readonly revision?: number;
}
export function roomQuestionErrors(content: RoomQuestionSet, quizId: string): string[] {
  const errors: string[] = [];
  if (!content.reviewed) errors.push('Подтвердите проверку вопросов и ответов.');
  if (!content.questions.length || content.questions.length > 15) errors.push('Нужно от 1 до 15 вопросов.');
  if (new Set(content.questions.map((question) => question.id)).size !== content.questions.length)
    errors.push('Вопросы не должны повторяться.');
  if (content.solutions.length !== content.questions.length) errors.push('Для каждого вопроса нужен один ключ ответа.');
  for (const [index, question] of content.questions.entries()) {
    const solution = content.solutions[index];
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(question.id) || question.quizId !== quizId ||
      question.status !== 'approved' || !question.prompt.trim() || question.prompt.length > 2000 ||
      !Number.isInteger(question.timeLimitSeconds) || question.timeLimitSeconds < 5 || question.timeLimitSeconds > 120 ||
      question.options.length !== 4 || question.options.some((option, i) => option.id !== String(i + 1) || !option.text.trim() || option.text.length > 500) ||
      solution?.questionId !== question.id || !['1', '2', '3', '4'].includes(solution.correctOptionId) ||
      !solution.explanation.trim() || solution.explanation.length > 4000 || (solution.reference?.length ?? 0) > 1000)
      errors.push(`Вопрос ${index + 1}: заполните текст, четыре варианта, правильный ответ и объяснение.`);
  }
  return errors;
}

export function selectedRoomQuestions(content: RoomQuestionSet, count: number): RoomQuestionSet {
  return { ...content, questions: content.questions.slice(0, count), solutions: content.solutions.slice(0, count) };
}
