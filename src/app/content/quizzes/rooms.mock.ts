import { GameRoom } from '../../core/domain/game-room';
import { GamePlayer } from '../../core/domain/game-player';
import { GameResult } from '../../core/domain/game-result';

export const MOCK_PLAYERS: readonly GamePlayer[] = ['Аня', 'Тимур', 'Маша'].map(
  (displayName, index) => ({
    id: `demo-player-${index + 1}`,
    roomId: 'demo-room',
    displayName,
    joinedOrder: index + 1,
    isMock: true,
    connectionStatus: 'connected',
    participationStatus: 'active',
  }),
);
export const MOCK_ROOMS: readonly GameRoom[] = [
  {
    id: 'demo-room',
    code: 'DEMO22',
    quizId: 'general-knowledge',
    quizVersion: 1,
    questionIds: ['general-1', 'general-2', 'general-3'],
    hostId: 'demo-host',
    hostNickname: 'Ведущий демо',
    nextJoinOrder: 4,
    phase: 'lobby',
    playerIds: MOCK_PLAYERS.map((p) => p.id),
    settings: {
      questionCount: 3,
      pointsPerCorrectAnswer: 100,
      speedBonusPoints: 50,
      minPlayers: 2,
      maxPlayers: 15,
      timeLimitSeconds: 20,
    },
    createdAt: Date.UTC(2026, 9, 31),
    revision: 0,
    currentRound: null,
  },
];
// Illustrative historic results, not scores from a played local session.
export const MOCK_RESULTS: readonly GameResult[] = [
  {
    roomId: 'demo-finished-room',
    roomCode: 'FINISH',
    quizId: 'general-knowledge',
    finishedAt: Date.UTC(2026, 9, 31),
    questionCount: 3,
    plannedQuestionCount: 3,
    hostNickname: 'Ведущий демо',
    settings: {
      questionCount: 3,
      timeLimitSeconds: 20,
      pointsPerCorrectAnswer: 1000,
      speedBonusPoints: 500,
      minPlayers: 2,
      maxPlayers: 15,
    },
    winnerId: 'result-player-1',
    isDemo: true,
    isFixture: true,
    standings: [
      {
        playerId: 'result-player-1',
        displayName: 'Аня',
        answeredQuestions: 3,
        isMock: true,
        rank: 1,
        totalPoints: 4100,
        correctAnswers: 3,
        correctResponseTimeMs: 16000,
      },
      {
        playerId: 'result-player-2',
        displayName: 'Тимур',
        answeredQuestions: 2,
        isMock: true,
        rank: 2,
        totalPoints: 2600,
        correctAnswers: 2,
        correctResponseTimeMs: 16000,
      },
      {
        playerId: 'result-player-3',
        displayName: 'Маша',
        answeredQuestions: 2,
        isMock: true,
        rank: 3,
        totalPoints: 1200,
        correctAnswers: 1,
        correctResponseTimeMs: 12000,
      },
    ],
  },
];
