import { Quiz } from './quiz';
import { QuestionSolution, QuizQuestion } from './quiz-question';
import { RoomSettings } from './game-room';
import { validRoomSettings } from './room-settings';

export const OWNER_EMAIL = 'rufatulymusa567@gmail.com';
export const MAX_ADMIN_QUESTIONS = 15;
export interface QuizDraft {
  id: string;
  quiz: Quiz;
  questions: QuizQuestion[];
  solutions: QuestionSolution[];
  reviewed: boolean;
  baseVersion: number;
  revision: number;
}
export function newDraft(): QuizDraft {
  const id = crypto.randomUUID();
  return { id, quiz: { id: `quiz-${id}`, version: 1, title: '', description: '', topic: '',
    difficulty: 'beginner', questionIds: [], defaultTimeLimitSeconds: 20, status: 'approved' },
    questions: [], solutions: [], reviewed: false, baseVersion: 0, revision: -1 };
}
export function publicationErrors(draft: QuizDraft): string[] {
  const errors: string[] = [];
  const quiz = draft.quiz;
  if (!quiz.title.trim() || quiz.title.length > 120) errors.push('Название: от 1 до 120 символов.');
  if (!quiz.topic.trim() || quiz.topic.length > 80) errors.push('Укажите тему до 80 символов.');
  if (quiz.description.length > 2000) errors.push('Описание: не больше 2 000 символов.');
  if (!Number.isInteger(quiz.defaultTimeLimitSeconds) || quiz.defaultTimeLimitSeconds < 5 || quiz.defaultTimeLimitSeconds > 120)
    errors.push('Время: целое число от 5 до 120 секунд.');
  if (!draft.reviewed) errors.push('Подтвердите проверку содержания и ответов.');
  if (!draft.questions.length || draft.questions.length > MAX_ADMIN_QUESTIONS)
    errors.push(`Добавьте от 1 до ${MAX_ADMIN_QUESTIONS} вопросов.`);
  if (new Set(draft.questions.map((question) => question.id)).size !== draft.questions.length)
    errors.push('Идентификаторы вопросов должны быть уникальны.');
  for (const [index, question] of draft.questions.entries()) {
    const solution = draft.solutions.find((entry) => entry.questionId === question.id);
    if (!question.prompt.trim() || question.prompt.length > 2000 || question.options.length !== 4 ||
      question.options.some((option, position) => option.id !== String(position + 1) || !option.text.trim() || option.text.length > 500) ||
      !solution || !question.options.some((option) => option.id === solution.correctOptionId) ||
      !solution.explanation.trim() || solution.explanation.length > 4000 || (solution.reference?.length ?? 0) > 1000)
      errors.push(`Вопрос ${index + 1}: нужны текст, четыре варианта, правильный ответ и объяснение в допустимых пределах.`);
  }
  return errors;
}
export function defaultsForQuiz(quiz: Quiz, defaults: RoomSettings | null): RoomSettings | null {
  if (!defaults) return null;
  const settings = { ...defaults, questionCount: Math.min(defaults.questionCount, quiz.questionIds.length) };
  return validRoomSettings(settings, quiz) ? settings : null;
}
