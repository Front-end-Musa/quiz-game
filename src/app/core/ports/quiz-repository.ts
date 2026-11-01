import { InjectionToken } from '@angular/core';
import { Quiz } from '../domain/quiz';
import { QuizQuestion } from '../domain/quiz-question';

export interface QuizRepository {
  list(): Promise<readonly Quiz[]>;
  get(id: string): Promise<Quiz | null>;
  getQuestions(quizId: string, version?: number): Promise<readonly QuizQuestion[]>;
}
export const QUIZ_REPOSITORY = new InjectionToken<QuizRepository>('QuizRepository');
