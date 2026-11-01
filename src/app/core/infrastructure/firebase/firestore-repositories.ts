import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Quiz } from '../../domain/quiz';
import { QuizQuestion } from '../../domain/quiz-question';
import { GameResult } from '../../domain/game-result';
import { QuizRepository } from '../../ports/quiz-repository';
import { ResultRepository } from '../../ports/result-repository';
import { FirebaseConnection } from './firebase-connection';

@Injectable()
export class FirestoreQuizRepository implements QuizRepository {
  private readonly connection = inject(FirebaseConnection);
  async list(): Promise<readonly Quiz[]> {
    await this.connection.ready();
    const snapshot = await getDocs(query(collection(this.connection.db, 'quizzes'),
      where('published', '==', true), where('archived', '==', false)));
    return snapshot.docs.map((entry) => entry.data() as Quiz);
  }
  async get(id: string): Promise<Quiz | null> {
    await this.connection.ready();
    const snapshot = await getDoc(doc(this.connection.db, 'quizzes', id));
    return snapshot.exists() && !snapshot.data()['archived'] ? snapshot.data() as Quiz : null;
  }
  async getQuestions(quizId: string, version?: number): Promise<readonly QuizQuestion[]> {
    const resolvedVersion = version ?? (await this.get(quizId))?.version;
    if (resolvedVersion === undefined) return [];
    const snapshot = await getDocs(collection(this.connection.db, 'quizzes', quizId,
      'versions', String(resolvedVersion), 'questions'));
    return snapshot.docs.map((entry) => entry.data() as QuizQuestion).sort((a, b) =>
      Number(a.metadata?.['position'] ?? Infinity) - Number(b.metadata?.['position'] ?? Infinity));
  }
}

@Injectable()
export class FirestoreResultRepository implements ResultRepository {
  private readonly connection = inject(FirebaseConnection);
  async list(): Promise<readonly GameResult[]> {
    const user = await this.connection.ready();
    const snapshot = await getDocs(query(collection(this.connection.db, 'results'),
      where('memberIds', 'array-contains', user.uid)));
    return snapshot.docs.map((entry) => entry.data()['result'] as GameResult)
      .sort((a, b) => b.finishedAt - a.finishedAt);
  }
  async getByRoom(code: string): Promise<GameResult | null> {
    await this.connection.ready();
    const snapshot = await getDoc(doc(this.connection.db, 'results', code.trim().toUpperCase()));
    return snapshot.exists() ? snapshot.data()['result'] as GameResult : null;
  }
}
