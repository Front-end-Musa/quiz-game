import { Injectable } from '@angular/core';
import { MOCK_QUESTIONS, MOCK_QUIZZES } from '../../../content/quizzes/quizzes.mock';
import { QuizRepository } from '../../ports/quiz-repository';

@Injectable()
export class MockQuizRepository implements QuizRepository {
  async list() {
    return structuredClone(MOCK_QUIZZES);
  }
  async get(id: string) {
    return structuredClone(MOCK_QUIZZES.find((q) => q.id === id) ?? null);
  }
  async getQuestions(quizId: string) {
    return structuredClone(MOCK_QUESTIONS.filter((q) => q.quizId === quizId));
  }
}
