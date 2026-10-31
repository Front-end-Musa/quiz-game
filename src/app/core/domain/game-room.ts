export type GamePhase =
  'lobby' | 'question_open' | 'answers_locked' | 'reveal' | 'finished' | 'cancelled';

export interface RoomSettings {
  readonly questionCount: number;
  readonly pointsPerCorrectAnswer: number;
  readonly speedBonusPoints: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly timeLimitSeconds: number;
  readonly prizeDescription?: string;
}

export interface GameRoom {
  readonly id: string;
  readonly code: string;
  readonly quizId: string;
  readonly quizVersion: number;
  readonly questionIds: readonly string[];
  readonly hostId: string;
  readonly hostNickname: string;
  readonly nextJoinOrder: number;
  readonly phase: GamePhase;
  readonly playerIds: readonly string[];
  readonly settings: RoomSettings;
  readonly createdAt: number;
  readonly revision: number;
  readonly currentRound: {
    readonly questionId: string;
    readonly index: number;
    readonly openedAt: number;
    readonly deadline: number;
  } | null;
}
