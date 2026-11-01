import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp,
  startAfter, QueryDocumentSnapshot, updateDoc } from 'firebase/firestore';
import { QuizDraft, newDraft, publicationErrors } from '../../domain/admin-quiz';
import { Quiz } from '../../domain/quiz';
import { QuestionSolution, QuizQuestion } from '../../domain/quiz-question';
import { RoomSettings } from '../../domain/game-room';
import { validRoomSettings } from '../../domain/room-settings';
import { FirebaseConnection } from './firebase-connection';

export type AdminRow = Record<string, unknown> & { id: string };
export interface AdminPage { rows: AdminRow[]; cursor: QueryDocumentSnapshot | null; }
@Injectable()
export class AdminRepository {
  private readonly connection = inject(FirebaseConnection);
  private get db() { return this.connection.db; }
  async page(name: 'quizzes' | 'adminDrafts' | 'rooms' | 'results', cursor?: QueryDocumentSnapshot | null): Promise<AdminPage> {
    await this.connection.ready();
    const sort = name === 'rooms' ? 'createdAt' : name === 'results' ? 'result.finishedAt' : name === 'adminDrafts' ? 'updatedAt' : '__name__';
    const entries = await getDocs(query(collection(this.db, name), orderBy(sort, sort === '__name__' ? 'asc' : 'desc'),
      ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    return { rows: entries.docs.map((entry) => ({ ...entry.data(), id: entry.id })), cursor: entries.docs.at(-1) ?? null };
  }
  async getDraft(id: string): Promise<QuizDraft | null> {
    await this.connection.ready();
    const snapshot = await getDoc(doc(this.db, 'adminDrafts', id));
    return snapshot.exists() ? snapshot.data() as QuizDraft : null;
  }
  async editPublished(quizId: string, duplicate = false): Promise<QuizDraft> {
    await this.connection.ready();
    const snapshot = await getDoc(doc(this.db, 'quizzes', quizId));
    if (!snapshot.exists()) throw new Error('Викторина не найдена.');
    const quiz = snapshot.data() as Quiz;
    const [questions, keys] = await Promise.all([
      getDocs(collection(this.db, 'quizzes', quizId, 'versions', String(quiz.version), 'questions')),
      getDoc(doc(this.db, 'quizSolutions', `${quizId}_v${quiz.version}`)),
    ]);
    const draft = newDraft();
    const id = duplicate ? draft.quiz.id : quizId;
    draft.quiz = { id, version: quiz.version, title: duplicate ? `${quiz.title} (копия)` : quiz.title,
      description: quiz.description, topic: quiz.topic, difficulty: quiz.difficulty,
      questionIds: [...quiz.questionIds], defaultTimeLimitSeconds: quiz.defaultTimeLimitSeconds, status: 'approved' };
    draft.baseVersion = duplicate ? 0 : quiz.version;
    draft.questions = quiz.questionIds.map((questionId) => questions.docs.find((entry) => entry.id === questionId)?.data() as QuizQuestion)
      .filter(Boolean).map((question) => ({ ...question, quizId: id }));
    draft.solutions = (keys.data()?.['solutions'] ?? []) as QuestionSolution[];
    await this.save(draft);
    draft.revision = 0;
    return draft;
  }
  async save(draft: QuizDraft): Promise<number> {
    const user = await this.connection.ready();
    return runTransaction(this.db, async (transaction) => {
      const ref = doc(this.db, 'adminDrafts', draft.id);
      const snapshot = await transaction.get(ref);
      if ((snapshot.data()?.['revision'] ?? -1) !== draft.revision)
        throw new Error('Черновик изменён в другой вкладке. Откройте его заново перед сохранением.');
      const revision = draft.revision + 1;
      transaction.set(ref, { id: draft.id, quiz: draft.quiz, questions: draft.questions,
        solutions: draft.solutions, reviewed: draft.reviewed, baseVersion: draft.baseVersion,
        revision, updatedAt: serverTimestamp(), updatedBy: user.uid });
      return revision;
    });
  }
  async publish(draft: QuizDraft): Promise<void> {
    const errors = publicationErrors(draft);
    if (errors.length) throw new Error(errors.join(' '));
    const user = await this.connection.ready();
    await runTransaction(this.db, async (transaction) => {
      const draftRef = doc(this.db, 'adminDrafts', draft.id);
      const quizRef = doc(this.db, 'quizzes', draft.quiz.id);
      const [saved, current] = await Promise.all([transaction.get(draftRef), transaction.get(quizRef)]);
      if (saved.data()?.['revision'] !== draft.revision) throw new Error('Сначала сохраните актуальный черновик.');
      if ((current.data()?.['version'] ?? 0) !== draft.baseVersion)
        throw new Error('Уже опубликована другая версия. Создайте черновик из актуальной викторины.');
      const version = draft.baseVersion + 1;
      const quiz: Quiz = { ...draft.quiz, version, status: 'approved', questionIds: draft.questions.map((question) => question.id) };
      const versionRef = doc(quizRef, 'versions', String(version));
      transaction.set(versionRef, { ...quiz, reviewed: true });
      transaction.set(doc(versionRef, 'checks', 'first'), { valid: true });
      transaction.set(doc(versionRef, 'checks', 'second'), { valid: true });
      for (const [index, question] of draft.questions.entries()) transaction.set(doc(versionRef, 'questions', question.id), {
        id: question.id, quizId: quiz.id, prompt: question.prompt, options: question.options,
        status: 'approved', timeLimitSeconds: quiz.defaultTimeLimitSeconds, metadata: { position: index },
      });
      transaction.set(doc(this.db, 'quizSolutions', `${quiz.id}_v${version}`), {
        quizId: quiz.id, version,
        solutions: draft.questions.map((question) => {
          const solution = draft.solutions.find((entry) => entry.questionId === question.id)!;
          return { questionId: question.id, correctOptionId: solution.correctOptionId,
            explanation: solution.explanation, reference: solution.reference ?? '' };
        }),
      });
      transaction.set(quizRef, { ...quiz, published: true, archived: false,
        updatedAt: serverTimestamp(), updatedBy: user.uid });
      transaction.update(draftRef, { baseVersion: version, quiz, revision: draft.revision + 1,
        updatedAt: serverTimestamp(), updatedBy: user.uid });
    });
  }
  async archiveQuiz(id: string, archived: boolean) {
    const user = await this.connection.ready();
    await updateDoc(doc(this.db, 'quizzes', id), { archived, updatedAt: serverTimestamp(), updatedBy: user.uid });
  }
  async saveDefaults(settings: RoomSettings) {
    const user = await this.connection.ready();
    if (!validRoomSettings(settings, { questionIds: Array.from({ length: 15 }, (_, index) => String(index)) }))
      throw new Error('Проверьте пределы настроек.');
    await runTransaction(this.db, async (transaction) => {
      transaction.set(doc(this.db, 'appSettings', 'gameDefaults'), { ...settings, updatedAt: serverTimestamp(), updatedBy: user.uid });
    });
  }
  async archiveSession(code: string) {
    const user = await this.connection.ready();
    await runTransaction(this.db, async (transaction) => {
      const ref = doc(this.db, 'rooms', code);
      const room = (await transaction.get(ref)).data();
      if (room?.['phase'] !== 'finished') throw new Error('Архивировать можно только завершённую игру.');
      transaction.update(ref, { archived: true, archivedAt: serverTimestamp(), archivedBy: user.uid });
    });
  }
}
