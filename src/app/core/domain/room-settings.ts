import { RoomSettings } from './game-room';
import { Quiz } from './quiz';

export function defaultRoomSettings(quiz: Quiz): RoomSettings {
  return {
    questionCount: quiz.questionIds.length,
    timeLimitSeconds: quiz.defaultTimeLimitSeconds,
    pointsPerCorrectAnswer: 100,
    speedBonusPoints: 50,
    minPlayers: 2,
    maxPlayers: 15,
  };
}

/** Shared boundary checks; UI validation alone is insufficient for adapters. */
export function validRoomSettings(settings: RoomSettings, quiz: Pick<Quiz, 'questionIds'>): boolean {
  const within = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;
  return (
    within(settings.questionCount, 1, quiz.questionIds.length) &&
    within(settings.timeLimitSeconds, 5, 120) &&
    within(settings.pointsPerCorrectAnswer, 1, 5000) &&
    within(settings.speedBonusPoints, 0, settings.pointsPerCorrectAnswer) &&
    within(settings.minPlayers, 2, settings.maxPlayers) &&
    within(settings.maxPlayers, 2, 15)
  );
}
