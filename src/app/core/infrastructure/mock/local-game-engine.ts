import { Injectable, inject } from '@angular/core';
import { MOCK_SOLUTIONS } from '../../../content/quizzes/quizzes.mock';
import { ScoringService } from '../../domain/scoring.service';
import { LeaderboardEntry } from '../../domain/game-result';
import { StoredRoom } from './room-store';
import { GAME_CLOCK } from '../../state/game-clock';

/** Adapter-side authority. Its rules use only generic questions, answers and settings. */
@Injectable({ providedIn: 'root' })
export class LocalGameEngine {
  private readonly scoring = inject(ScoringService);
  private readonly clock = inject(GAME_CLOCK);
  solution(questionId: string, stored?: StoredRoom) {
    return (stored?.customContent?.solutions ?? MOCK_SOLUTIONS).find((s) => s.questionId === questionId);
  }
  open(stored: StoredRoom, index: number): StoredRoom {
    const openedAt = this.clock.now();
    return {
      ...stored,
      room: {
        ...stored.room,
        phase: 'question',
        revision: stored.room.revision + 1,
        currentRound: {
          id: crypto.randomUUID(),
          index,
          questionId: stored.room.questionIds[index],
          openedAt,
          deadline: openedAt + stored.room.settings.timeLimitSeconds * 1000,
        },
      },
    };
  }
  reveal(stored: StoredRoom): StoredRoom {
    const round = stored.room.currentRound;
    if (!round || stored.room.phase !== 'question') return stored;
    const solution = this.solution(round.questionId, stored);
    if (!solution) throw new Error('Missing solution');
    const awards = stored.players.map((player) => {
      const answer = stored.answers.find((a) => a.playerId === player.id && a.roundId === round.id);
      const correct = answer?.optionId === solution.correctOptionId;
      const duration = round.deadline - round.openedAt;
      return {
        playerId: player.id,
        correct,
        points: this.scoring.calculate(
          correct,
          answer ? round.deadline - answer.acceptedAt : 0,
          duration,
          stored.room.settings.pointsPerCorrectAnswer,
          stored.room.settings.speedBonusPoints,
        ),
        responseTimeMs:
          correct && answer
            ? Math.max(0, Math.min(duration, answer.acceptedAt - round.openedAt))
            : 0,
      };
    });
    return {
      ...stored,
      reveals: [
        ...stored.reveals.filter((r) => r.roundId !== round.id),
        {
          roundId: round.id,
          questionId: round.questionId,
          index: round.index,
          solution: structuredClone(solution),
          awards,
        },
      ],
      room: { ...stored.room, phase: 'reveal', revision: stored.room.revision + 1 },
    };
  }
  standings(stored: StoredRoom): readonly LeaderboardEntry[] {
    return stored.players
      .map((p) => {
        const awards = stored.reveals.flatMap((r) => r.awards.filter((a) => a.playerId === p.id));
        return {
          playerId: p.id,
          displayName: p.displayName,
          rank: 0,
          isMock: p.isMock,
          answeredQuestions: stored.answers.filter(
            (a) => a.playerId === p.id && stored.reveals.some((r) => r.roundId === a.roundId),
          ).length,
          totalPoints: awards.reduce((sum, a) => sum + a.points, 0),
          correctAnswers: awards.filter((a) => a.correct).length,
          correctResponseTimeMs: awards.reduce((sum, a) => sum + a.responseTimeMs, 0),
          joinedOrder: p.joinedOrder,
        };
      })
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints ||
          b.correctAnswers - a.correctAnswers ||
          a.correctResponseTimeMs - b.correctResponseTimeMs ||
          a.joinedOrder - b.joinedOrder,
      )
      .map(({ joinedOrder, ...entry }, index) => ({ ...entry, rank: index + 1 }));
  }
  finish(stored: StoredRoom): StoredRoom {
    const revealed = this.reveal(stored);
    const standings = this.standings(revealed);
    return {
      ...revealed,
      room: { ...revealed.room, phase: 'finished', revision: revealed.room.revision + 1 },
      result: {
        roomId: stored.room.id,
        roomCode: stored.room.code,
        quizId: stored.room.quizId,
        quizVersion: stored.room.quizVersion,
        hasCustomQuestions: !!stored.room.hasCustomQuestions,
        finishedAt: this.clock.now(),
        questionCount: revealed.reveals.length,
        plannedQuestionCount: stored.room.questionIds.length,
        settings: structuredClone(stored.room.settings),
        hostNickname: stored.room.hostNickname,
        winnerId: standings[0]?.playerId ?? '',
        standings,
        isDemo: true,
      },
    };
  }
  advance(stored: StoredRoom): StoredRoom {
    const index = stored.room.currentRound!.index + 1;
    return index < stored.room.questionIds.length ? this.open(stored, index) : this.finish(stored);
  }
  restart(stored: StoredRoom): StoredRoom {
    const round = stored.room.currentRound!;
    return this.open(
      {
        ...stored,
        answers: stored.answers.filter((a) => a.roundId !== round.id),
        reveals: stored.reveals.filter((r) => r.roundId !== round.id),
      },
      round.index,
    );
  }
}
