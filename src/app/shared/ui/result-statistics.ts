import { LeaderboardEntry } from '../../core/domain/game-result';

export function accuracy(entry: LeaderboardEntry, questions: number): number {
  return questions > 0 ? Math.round((entry.correctAnswers / questions) * 100) : 0;
}
export function playerStatistics(entry: LeaderboardEntry, questions: number) {
  return {
    accuracy: accuracy(entry, questions),
    incorrect: Math.max(0, entry.answeredQuestions - entry.correctAnswers),
    unanswered: Math.max(0, questions - entry.answeredQuestions),
    averageCorrectSeconds:
      entry.correctAnswers > 0 ? entry.correctResponseTimeMs / entry.correctAnswers / 1000 : null,
  };
}
