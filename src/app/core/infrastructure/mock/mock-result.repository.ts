import { Injectable, inject } from '@angular/core';
import { firstValueFrom, filter } from 'rxjs';
import { MOCK_RESULTS } from '../../../content/quizzes/rooms.mock';
import { ResultRepository } from '../../ports/result-repository';
import { ROOM_STORE } from './room-store';
import { GameResult } from '../../domain/game-result';

@Injectable()
export class MockResultRepository implements ResultRepository {
  private readonly store = inject(ROOM_STORE);
  async list(): Promise<readonly GameResult[]> {
    const rooms = await firstValueFrom(
      this.store.changes.pipe(filter((value) => value !== undefined)),
    );
    // StoredRoom is normalized by the persistence adapter; migrations belong there once.
    const results = rooms.flatMap((room) => (room.result ? [room.result] : []));
    return structuredClone(
      [...results, ...MOCK_RESULTS].sort(
        (a, b) => b.finishedAt - a.finishedAt || a.roomCode.localeCompare(b.roomCode),
      ),
    );
  }
  async getByRoom(code: string) {
    return (await this.list()).find((r) => r.roomCode === code.trim().toUpperCase()) ?? null;
  }
}
