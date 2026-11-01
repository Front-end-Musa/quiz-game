import { QuestionSolution } from './quiz-question';

export interface RoundAward {
  readonly playerId: string;
  readonly points: number;
  readonly correct: boolean;
  readonly responseTimeMs: number;
}
export interface RoundReveal {
  readonly roundId: string;
  readonly questionId: string;
  readonly index: number;
  readonly solution: QuestionSolution;
  readonly awards: readonly RoundAward[];
}
