export interface LeaderboardEntry {
  readonly playerId: string;
  readonly displayName: string;
  readonly rank: number;
  readonly totalPoints: number;
  readonly correctAnswers: number;
  readonly correctResponseTimeMs: number;
}

export interface GameResult {
  readonly roomId: string;
  readonly roomCode: string;
  readonly quizId: string;
  readonly finishedAt: number;
  readonly winnerId: string;
  readonly standings: readonly LeaderboardEntry[];
  readonly isDemo: boolean;
}
