import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScoringService {
  calculate(
    isCorrect: boolean,
    remainingTime: number,
    timeLimit: number,
    pointsPerCorrectAnswer = 100,
    maxSpeedBonus = 50,
  ): number {
    if (!isCorrect || !Number.isFinite(timeLimit) || timeLimit <= 0) return 0;
    const remaining = Number.isFinite(remainingTime)
      ? Math.min(timeLimit, Math.max(0, remainingTime))
      : 0;
    return pointsPerCorrectAnswer + Math.floor(maxSpeedBonus * (remaining / timeLimit));
  }
}
