import { InjectionToken } from '@angular/core';
export interface GameClock {
  now(): number;
}
export const GAME_CLOCK = new InjectionToken<GameClock>('GameClock', {
  providedIn: 'root',
  factory: () => ({ now: () => Date.now() }),
});
