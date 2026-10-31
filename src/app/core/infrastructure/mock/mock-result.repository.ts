import { Injectable } from '@angular/core';
import { MOCK_RESULTS } from '../../../content/quizzes/rooms.mock';
import { ResultRepository } from '../../ports/result-repository';

@Injectable()
export class MockResultRepository implements ResultRepository {
  async list() {
    return structuredClone(MOCK_RESULTS);
  }
  async getByRoom(code: string) {
    return structuredClone(
      MOCK_RESULTS.find((r) => r.roomCode === code.trim().toUpperCase()) ?? null,
    );
  }
}
