import { RoomSettings } from './game-room';
export interface LeaderboardEntry {
  readonly playerId: string;
  readonly displayName: string;
  readonly rank: number;
  readonly totalPoints: number;
  readonly correctAnswers: number;
  readonly answeredQuestions: number;
  readonly isMock: boolean;
  readonly correctResponseTimeMs: number;
}

export interface GameResult {
  readonly roomId: string;
  readonly roomCode: string;
  readonly quizId: string;
  readonly quizVersion?: number;
  readonly hasCustomQuestions?: boolean;
  readonly finishedAt: number;
  readonly questionCount: number;
  readonly plannedQuestionCount: number;
  readonly settings: RoomSettings;
  readonly hostNickname: string;
  readonly winnerId: string;
  readonly standings: readonly LeaderboardEntry[];
  readonly isDemo: boolean;
  readonly isFixture?: boolean;
}
