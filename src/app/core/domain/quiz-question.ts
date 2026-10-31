import { ContentStatus } from './quiz';

export interface AnswerOption {
  readonly id: string;
  readonly text: string;
}

/** No correct answer is exposed in the question presented to players. */
export interface QuizQuestion {
  readonly id: string;
  readonly quizId: string;
  readonly prompt: string;
  readonly options: readonly AnswerOption[];
  readonly timeLimitSeconds: number;
  readonly status: ContentStatus;
  readonly metadata?: Record<string, string | number>;
}

/** Stored separately so a future adapter can protect unrevealed solutions. */
export interface QuestionSolution {
  readonly questionId: string;
  readonly correctOptionId: string;
  readonly explanation: string;
}
