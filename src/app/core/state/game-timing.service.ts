import { Injectable, inject } from '@angular/core';
import { interval, map, of, startWith, switchMap, tap } from 'rxjs';
import { GAME_CLOCK } from './game-clock';
import { ROOM_GATEWAY } from '../ports/room-gateway';

@Injectable({ providedIn: 'root' })
export class GameTimingService {
  private readonly rooms = inject(ROOM_GATEWAY);
  private readonly clock = inject(GAME_CLOCK);
  watch(code: string) {
    let pending = false;
    let retryAt = 0;
    let error = '';
    return this.rooms.observe(code).pipe(
      switchMap((state) =>
        state?.room.phase === 'question'
          ? interval(100).pipe(
              startWith(0),
              map(() => state),
            )
          : of(state),
      ),
      map((state) => {
        if (state?.room.phase !== 'question') error = '';
        const round = state?.room.currentRound;
        const duration = round ? round.deadline - round.openedAt : 0;
        const remainingMs =
          state?.room.phase === 'question' && round
            ? Math.max(0, Math.min(duration, round.deadline - this.clock.now()))
            : 0;
        return {
          state,
          remainingMs,
          seconds: Math.ceil(remainingMs / 1000),
          remainingPercent: duration > 0 ? (remainingMs / duration) * 100 : 0,
          error,
        };
      }),
      tap((frame) => {
        const state = frame.state;
        if (
          !pending &&
          state?.room.phase === 'question' &&
          state.viewerRole !== 'visitor' &&
          (!state.hostOnlyProgression || state.viewerRole === 'host') &&
          frame.remainingMs === 0 &&
          this.clock.now() >= retryAt
        ) {
          pending = true;
          // Commit after delivering this frame, avoiding reentrant snapshots overwriting reveal.
          void Promise.resolve()
            .then(() => this.rooms.expire(code, state.room.currentRound!.id))
            .then((result) => {
              error =
                !result.ok && result.error === 'storage-unavailable'
                  ? 'Не удалось показать ответ. Повторяем сохранение…'
                  : '';
            })
            .catch(() => {
              error = 'Не удалось завершить вопрос. Повторяем…';
            })
            .finally(() => {
              pending = false;
              retryAt = this.clock.now() + 1000;
            });
        }
      }),
    );
  }
}
