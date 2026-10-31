import { InjectionToken } from '@angular/core';
import { GameResult } from '../domain/game-result';

export interface ResultRepository {
  list(): Promise<readonly GameResult[]>;
  getByRoom(code: string): Promise<GameResult | null>;
}
export const RESULT_REPOSITORY = new InjectionToken<ResultRepository>('ResultRepository');
