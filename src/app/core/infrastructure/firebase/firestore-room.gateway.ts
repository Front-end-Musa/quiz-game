import { Injectable, inject } from '@angular/core';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction,
  serverTimestamp, setDoc, Timestamp, where, Transaction,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { GameRoom, RoomSettings } from '../../domain/game-room';
import { GamePlayer } from '../../domain/game-player';
import { GameResult, LeaderboardEntry } from '../../domain/game-result';
import { PlayerAnswer } from '../../domain/player-answer';
import { QuestionSolution, QuizQuestion } from '../../domain/quiz-question';
import { RoomQuestionSet, roomQuestionErrors } from '../../domain/room-question-set';
import { RoundReveal } from '../../domain/round-reveal';
import { normalizeNickname } from '../../domain/nickname';
import { defaultRoomSettings, validRoomSettings } from '../../domain/room-settings';
import { ScoringService } from '../../domain/scoring.service';
import { CommandResult, RoomErrorCode, RoomGateway, RoomSnapshot } from '../../ports/room-gateway';
import { FirebaseConnection } from './firebase-connection';
import { FirestoreQuizRepository } from './firestore-repositories';
import { GameDefaultsRepository } from './game-defaults.repository';
import { defaultsForQuiz } from '../../domain/admin-quiz';

export interface RemoteRoom extends Omit<GameRoom, 'createdAt' | 'currentRound'> {
  createdAt: Timestamp;
  currentRound: (Omit<NonNullable<GameRoom['currentRound']>, 'openedAt' | 'deadline'> & {
    openedAt: Timestamp;
  }) | null;
  players: GamePlayer[];
  standings: LeaderboardEntry[];
  reveal: RoundReveal | null;
  result: GameResult | null;
  closing: boolean;
}
interface JoinRequest {
  displayName: string;
  status: 'pending' | 'accepted' | 'rejected';
  error?: RoomErrorCode;
  player?: GamePlayer;
}
const codeOf = (code: string) => code.trim().toUpperCase();
const validName = (name: string) => !!name.trim() && name.trim().length <= 24;
const ok = <T>(value: T): CommandResult<T> => ({ ok: true, value });
const fail = <T>(error: RoomErrorCode): CommandResult<T> => ({ ok: false, error });
class Rejection extends Error {
  constructor(readonly reason: RoomErrorCode) { super(reason); }
}
function reject(reason: RoomErrorCode): never { throw new Rejection(reason); }
export function projectRoom(remote: RemoteRoom): GameRoom {
  const { players: _players, standings: _standings, reveal: _reveal, result: _result,
    closing: _closing, ...room } = remote;
  const openedAt = remote.currentRound?.openedAt?.toMillis();
  return { ...room, createdAt: remote.createdAt.toMillis(),
    currentRound: remote.currentRound && openedAt !== undefined ? {
      ...remote.currentRound, openedAt,
      deadline: openedAt + remote.settings.timeLimitSeconds * 1000,
    } : null };
}

@Injectable()
export class FirestoreRoomGateway implements RoomGateway {
  private readonly connection = inject(FirebaseConnection);
  private readonly quizzes = inject(FirestoreQuizRepository);
  private readonly defaults = inject(GameDefaultsRepository, { optional: true });
  private readonly scoring = inject(ScoringService);
  private readonly admissions = new Set<string>();
  private admissionQueue = Promise.resolve();
  private roomRef(code: string) { return doc(this.connection.db, 'rooms', codeOf(code)); }
  private async attempt<T>(action: () => Promise<T>): Promise<CommandResult<T>> {
    try { await this.connection.ready(); return ok(await action()); }
    catch (error) {
      if (error instanceof Rejection) return fail(error.reason);
      this.connection.report(error);
      return fail((error as { code?: string })?.code === 'permission-denied'
        ? 'forbidden' : 'storage-unavailable');
    }
  }

  observe(code: string): Observable<RoomSnapshot | null> {
    return new Observable((subscriber) => {
      let disposed = false;
      let stopRoom = () => {};
      let stopRequests = () => {};
      let stopAnswer = () => {};
      let answerRound = '';
      let answer: PlayerAnswer | null = null;
      let remote: RemoteRoom | undefined;
      let uid = '';
      let listeningRequests = false;
      let cached = false;
      const emit = () => {
        if (!remote || !remote.createdAt || remote.currentRound && !remote.currentRound.openedAt) return;
        const room = projectRoom(remote);
        const host = room.hostId === uid;
        const player = remote.players.find((entry) => entry.id === uid);
        subscriber.next({ room, players: remote.players, viewerRole: host ? 'host' : player ? 'player' : 'visitor',
          viewerPlayerId: player?.id, persistent: true, ownAnswer: answer,
          connectionStatus: cached ? 'cached' : 'online', closing: remote.closing, hostOnlyProgression: true,
          score: remote.standings.find((entry) => entry.playerId === uid)?.totalPoints ?? 0,
          reveal: remote.reveal, standings: remote.standings, result: remote.result,
          canUseDevControls: false });
      };
      void this.connection.ready().then((user) => {
        if (disposed) return;
        uid = user.uid;
        stopRoom = onSnapshot(this.roomRef(code), { includeMetadataChanges: true }, (snapshot) => {
          // A server timestamp is authoritative only after acknowledgement.
          if (snapshot.metadata.hasPendingWrites) return;
          if (!snapshot.exists()) { subscriber.next(null); return; }
          remote = snapshot.data() as RemoteRoom;
          cached = snapshot.metadata.fromCache;
          if (remote.hostId === uid && !listeningRequests) {
            listeningRequests = true;
            stopRequests = onSnapshot(query(collection(this.roomRef(code), 'joinRequests'),
              where('status', '==', 'pending')), (requests) => {
                for (const request of requests.docs) this.queueAdmission(code, request.id);
              }, (error) => this.connection.report(error));
          }
          const nextRound = remote.playerIds.includes(uid) ? remote.currentRound?.id ?? '' : '';
          if (nextRound !== answerRound) {
            stopAnswer(); answer = null; answerRound = nextRound;
            if (nextRound) stopAnswer = onSnapshot(doc(this.roomRef(code), 'rounds', nextRound, 'answers', uid),
              { includeMetadataChanges: true }, (entry) => {
                if (entry.metadata.hasPendingWrites) return;
                answer = entry.exists() ? this.answerFrom(entry.data()) : null;
                emit();
              }, (error) => this.connection.report(error));
          }
          emit();
          // Recover a host refresh between closure and publication.
          if (remote.hostId === uid && remote.closing && remote.currentRound)
            void this.revealAnswer(code, remote.currentRound.id);
        }, (error) => { this.connection.report(error); subscriber.next(null); });
      }).catch((error: unknown) => { this.connection.report(error); subscriber.next(null); });
      return () => { disposed = true; stopRoom(); stopRequests(); stopAnswer(); };
    });
  }

  create(quizId: string, settings?: RoomSettings, hostNickname = 'Ведущий', content?: RoomQuestionSet) {
    return this.attempt(async () => {
      const quiz = await this.quizzes.get(quizId);
      if (!quiz) reject('quiz-not-found');
      if (quiz.status === 'placeholder' && !content || quiz.archived) reject('content-unavailable');
      if (!validName(hostNickname)) reject('invalid-name');
      const defaults = defaultsForQuiz(quiz, await this.defaults?.get() ?? null) ?? defaultRoomSettings(quiz);
      const configuration = settings ?? { ...defaults, questionCount: content?.questions.length ?? defaults.questionCount };
      if (content && roomQuestionErrors(content, quizId).length) reject('invalid-settings');
      if (!validRoomSettings(configuration, content ? { questionIds: content.questions.map((question) => question.id) } : quiz) ||
        content && configuration.questionCount !== content.questions.length) reject('invalid-settings');
      const uid = this.connection.auth.currentUser!.uid;
      for (let retry = 0; retry < 5; retry++) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => alphabet[n % alphabet.length]).join('');
        const reserved = await runTransaction(this.connection.db, async (transaction) => {
          const codeRef = doc(this.connection.db, 'roomCodes', code);
          if ((await transaction.get(codeRef)).exists()) return false;
          transaction.set(codeRef, { code, title: quiz.title, roomId: code });
          transaction.set(this.roomRef(code), {
            id: code, code, quizId, quizVersion: quiz.version,
            questionIds: content ? content.questions.map((question) => question.id) : quiz.questionIds.slice(0, configuration.questionCount),
            hasCustomQuestions: !!content, contentRevision: content ? 1 : 0,
            hostId: uid, hostNickname: hostNickname.trim(), nextJoinOrder: 1,
            phase: 'lobby', playerIds: [], settings: configuration, createdAt: serverTimestamp(),
            revision: 0, currentRound: null, players: [], standings: [], reveal: null, result: null, closing: false,
          });
          if (content) this.writeContent(transaction, code, content, 1);
          return true;
        });
        if (reserved) return projectRoom((await getDoc(this.roomRef(code))).data() as RemoteRoom);
      }
      return reject('storage-unavailable');
    });
  }

  private solutionRef(room: Pick<RemoteRoom, 'id' | 'quizId' | 'quizVersion' | 'hasCustomQuestions'>) {
    return room.hasCustomQuestions ? doc(this.roomRef(room.id), 'private', 'solutions') :
      doc(this.connection.db, 'quizSolutions', `${room.quizId}_v${room.quizVersion}`);
  }
  async publicQuestions(code: string): Promise<readonly QuizQuestion[]> {
    await this.connection.ready();
    const room = (await getDoc(this.roomRef(code))).data() as RemoteRoom;
    if (!room) throw new Error('Комната не найдена.');
    const questions = room.hasCustomQuestions
      ? ((await getDoc(doc(this.roomRef(code), 'content', 'questions'))).data()?.['questions'] ?? []) as QuizQuestion[]
      : await this.quizzes.getQuestions(room.quizId, room.quizVersion);
    return room.questionIds.map((id) => questions.find((question) => question.id === id)!).filter(Boolean);
  }
  editableQuizQuestions(quizId: string, version: number): Promise<CommandResult<RoomQuestionSet>> {
    return this.attempt(async () => {
      const [questions, keys] = await Promise.all([
        this.quizzes.getQuestions(quizId, version),
        getDoc(doc(this.connection.db, 'quizSolutions', `${quizId}_v${version}`)),
      ]);
      return { questions, solutions: keys.data()?.['solutions'] ?? [], reviewed: false, revision: 0 };
    });
  }
  editableRoomQuestions(code: string): Promise<CommandResult<RoomQuestionSet>> {
    return this.attempt(async () => {
      const room = (await getDoc(this.roomRef(code))).data() as RemoteRoom;
      if (!room) reject('room-not-found');
      if (room.hostId !== this.connection.auth.currentUser!.uid) reject('forbidden');
      const [questions, keys] = await Promise.all([this.publicQuestions(code), getDoc(this.solutionRef(room))]);
      const solutions = keys.data()?.['solutions'] as QuestionSolution[] | undefined;
      return { questions, solutions: room.questionIds.map((id) => solutions?.find((solution) => solution.questionId === id)!).filter(Boolean),
        reviewed: !!room.hasCustomQuestions, revision: room.contentRevision ?? 0 };
    });
  }
  private writeContent(transaction: Transaction, code: string, content: RoomQuestionSet, revision: number) {
    const ref = this.roomRef(code);
    transaction.set(doc(ref, 'content', 'questions'), { revision, questions: content.questions.map((question, index) => ({
      id: question.id, quizId: question.quizId, prompt: question.prompt, options: question.options,
      timeLimitSeconds: question.timeLimitSeconds, status: 'approved', metadata: { position: index },
    })) });
    transaction.set(doc(ref, 'private', 'solutions'), { reviewed: true, revision, solutions: content.solutions.map((solution) => ({
      questionId: solution.questionId, correctOptionId: solution.correctOptionId, explanation: solution.explanation, reference: solution.reference ?? '',
    })) });
    for (const part of ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ready']) transaction.set(doc(ref, 'contentChecks', part), { revision });
  }
  updateQuestions(code: string, content: RoomQuestionSet): Promise<CommandResult<void>> {
    return this.attempt(async () => {
      await runTransaction(this.connection.db, async (transaction) => {
        const ref = this.roomRef(code);
        const room = (await transaction.get(ref)).data() as RemoteRoom;
        if (!room) reject('room-not-found');
        if (room.hostId !== this.connection.auth.currentUser!.uid) reject('forbidden');
        if (room.phase !== 'lobby') reject('game-started');
        if (roomQuestionErrors(content, room.quizId).length || content.revision !== (room.contentRevision ?? 0)) reject('invalid-settings');
        const revision = (room.contentRevision ?? 0) + 1;
        transaction.update(ref, { questionIds: content.questions.map((question) => question.id), hasCustomQuestions: true,
          contentRevision: revision, settings: { ...room.settings, questionCount: content.questions.length }, revision: room.revision + 1 });
        this.writeContent(transaction, code, content, revision);
      });
    });
  }

  join(code: string, displayName: string): Promise<CommandResult<GamePlayer>> {
    return this.attempt(async () => {
      if (!validName(displayName)) reject('invalid-name');
      const uid = this.connection.auth.currentUser!.uid;
      if (!(await getDoc(doc(this.connection.db, 'roomCodes', codeOf(code)))).exists()) reject('room-not-found');
      // Authorized members can reconnect after start without changing membership.
      try {
        const room = (await getDoc(this.roomRef(code))).data() as RemoteRoom | undefined;
        if (room?.hostId === uid) reject('host-cannot-join');
        const existing = room?.players.find((entry) => entry.id === uid);
        if (existing) return existing;
      } catch (error) { if (error instanceof Rejection) throw error; }
      const ref = doc(this.roomRef(code), 'joinRequests', uid);
      await setDoc(ref, { displayName: displayName.trim(), status: 'pending', requestedAt: serverTimestamp() });
      return new Promise<GamePlayer>((resolve, rejectPromise) => {
        const timeout = setTimeout(() => { stop(); rejectPromise(new Rejection('host-unavailable')); }, 30000);
        const stop = onSnapshot(ref, (snapshot) => {
          const request = snapshot.data() as JoinRequest | undefined;
          if (request?.status === 'accepted' && request.player) {
            clearTimeout(timeout); stop(); resolve(request.player);
          } else if (request?.status === 'rejected') {
            clearTimeout(timeout); stop(); rejectPromise(new Rejection(request.error ?? 'forbidden'));
          }
        }, (error) => { clearTimeout(timeout); stop(); rejectPromise(error); });
      });
    });
  }

  private queueAdmission(code: string, uid: string) {
    const key = `${code}/${uid}`;
    if (this.admissions.has(key)) return;
    this.admissions.add(key);
    this.admissionQueue = this.admissionQueue.then(() => this.admit(code, uid))
      .finally(() => this.admissions.delete(key));
  }
  private async admit(code: string, uid: string) {
    try {
      await runTransaction(this.connection.db, async (transaction) => {
        const ref = this.roomRef(code);
        const requestRef = doc(ref, 'joinRequests', uid);
        const [roomSnap, requestSnap] = await Promise.all([transaction.get(ref), transaction.get(requestRef)]);
        const room = roomSnap.data() as RemoteRoom;
        const request = requestSnap.data() as JoinRequest;
        if (!request || request.status !== 'pending') return;
        let error: RoomErrorCode | undefined;
        const existing = room.players.find((entry) => entry.id === uid);
        if (room.hostId === uid) error = 'host-cannot-join';
        else if (existing) { transaction.update(requestRef, { status: 'accepted', player: existing }); return; }
        else if (room.phase !== 'lobby') error = 'game-started';
        else if (room.players.length >= room.settings.maxPlayers) error = 'room-full';
        else if (!validName(request.displayName)) error = 'invalid-name';
        else if ([room.hostNickname, ...room.players.map((entry) => entry.displayName)]
          .some((name) => normalizeNickname(name) === normalizeNickname(request.displayName))) error = 'name-taken';
        if (error) { transaction.update(requestRef, { status: 'rejected', error }); return; }
        const player: GamePlayer = { id: uid, roomId: room.id, displayName: request.displayName,
          joinedOrder: room.nextJoinOrder, connectionStatus: 'connected', participationStatus: 'active', isMock: false };
        transaction.update(ref, { players: [...room.players, player], playerIds: [...room.playerIds, uid],
          nextJoinOrder: room.nextJoinOrder + 1, revision: room.revision + 1 });
        transaction.update(requestRef, { status: 'accepted', player });
      });
    } catch (error) { this.connection.report(error); }
  }

  private hostChange<T>(code: string, action: (room: RemoteRoom) => { changes: object; value: T }) {
    return this.attempt(() => runTransaction(this.connection.db, async (transaction) => {
      const ref = this.roomRef(code);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) reject('room-not-found');
      const room = snapshot.data() as RemoteRoom;
      if (room.hostId !== this.connection.auth.currentUser!.uid) reject('forbidden');
      const next = action(room);
      transaction.update(ref, { ...next.changes, revision: room.revision + 1 });
      return next.value;
    }));
  }
  removePlayer(code: string, playerId: string) {
    return this.hostChange(code, (room) => {
      if (room.phase !== 'lobby') reject('game-started');
      if (!room.playerIds.includes(playerId)) reject('player-not-found');
      return { changes: { players: room.players.filter((entry) => entry.id !== playerId),
        playerIds: room.playerIds.filter((id) => id !== playerId) }, value: undefined };
    });
  }
  setMinimumPlayers(code: string, minimum: number) {
    return this.hostChange(code, (room) => {
      if (room.phase !== 'lobby') reject('game-started');
      if (!Number.isInteger(minimum) || minimum < 2 || minimum > room.settings.maxPlayers) reject('invalid-settings');
      return { changes: { settings: { ...room.settings, minPlayers: minimum } }, value: undefined };
    });
  }

  async start(code: string): Promise<CommandResult<GameRoom>> {
    const result = await this.openRound(code, null);
    if (!result.ok) return result;
    return this.attempt(async () => projectRoom((await getDoc(this.roomRef(code))).data() as RemoteRoom));
  }
  private openRound(code: string, previousRound: string | null): Promise<CommandResult<void>> {
    return this.attempt(async () => {
      const ref = this.roomRef(code);
      const initial = (await getDoc(ref)).data() as RemoteRoom;
      if (!initial) reject('room-not-found');
      const questions = await this.publicQuestions(code);
      // Host-only read ensures missing protected content prevents starting a game.
      const solutions = await getDoc(this.solutionRef(initial));
      if (!solutions.exists()) reject('content-unavailable');
      await runTransaction(this.connection.db, async (transaction) => {
        const room = (await transaction.get(ref)).data() as RemoteRoom;
        if (room.hostId !== this.connection.auth.currentUser!.uid) reject('forbidden');
        if ((room.contentRevision ?? 0) !== (initial.contentRevision ?? 0)) reject('invalid-settings');
        const index = previousRound === null ? 0 : (room.currentRound?.index ?? -1) + 1;
        if (previousRound === null) {
          if (room.phase !== 'lobby') reject('invalid-phase');
          if (room.players.length < room.settings.minPlayers) reject('not-enough-players');
        } else if (room.currentRound?.id !== previousRound) reject('stale-round');
        else if (room.phase !== 'reveal') reject('invalid-phase');
        if (index >= room.questionIds.length) {
          const result: GameResult = { roomId: room.id, roomCode: room.code, quizId: room.quizId,
            quizVersion: room.quizVersion, finishedAt: Date.now(), questionCount: index,
            hasCustomQuestions: !!room.hasCustomQuestions,
            plannedQuestionCount: room.questionIds.length, settings: room.settings,
            hostNickname: room.hostNickname, winnerId: room.standings[0]?.playerId ?? '',
            standings: room.standings, isDemo: false };
          transaction.update(ref, { phase: 'finished', result, revision: room.revision + 1 });
          transaction.set(doc(this.connection.db, 'results', room.code), {
            hostId: room.hostId, memberIds: [room.hostId, ...room.playerIds], result,
          });
          return;
        }
        const question = questions.find((entry) => entry.id === room.questionIds[index]);
        const solution = (solutions.data()!['solutions'] as QuestionSolution[])
          .find((entry) => entry.questionId === question?.id);
        if (!question || !solution) reject('content-unavailable');
        const id = crypto.randomUUID();
        transaction.set(doc(ref, 'rounds', id), { id, questionId: question.id, index,
          startedAt: serverTimestamp(), durationSeconds: room.settings.timeLimitSeconds,
          optionIds: question.options.map((option) => option.id), closed: false, scored: false });
        transaction.update(ref, { phase: 'question', closing: false, reveal: null,
          currentRound: { id, questionId: question.id, index, openedAt: serverTimestamp() },
          revision: room.revision + 1 });
      });
    });
  }
  private answerFrom(data: Record<string, unknown>): PlayerAnswer {
    return { ...data, acceptedAt: (data['acceptedAt'] as Timestamp).toMillis() } as PlayerAnswer;
  }
  submitAnswer(code: string, roundId: string, optionId: string, commandId: string) {
    return this.attempt(async () => {
      const uid = this.connection.auth.currentUser!.uid;
      const ref = this.roomRef(code);
      const answerRef = doc(ref, 'rounds', roundId, 'answers', uid);
      await runTransaction(this.connection.db, async (transaction) => {
        const [snapshot, previous] = await Promise.all([transaction.get(ref), transaction.get(answerRef)]);
        if (previous.exists()) {
          if (previous.data()['commandId'] === commandId && previous.data()['optionId'] === optionId) return;
          reject('already-answered');
        }
        const room = snapshot.data() as RemoteRoom;
        if (!room.playerIds.includes(uid)) reject('forbidden');
        const round = room.currentRound;
        if (round?.id !== roundId) reject('stale-round');
        if (room.phase !== 'question' || room.closing) reject('answer-too-late');
        transaction.set(answerRef, { id: commandId, commandId, roomId: room.id, playerId: uid,
          questionId: round.questionId, roundIndex: round.index, roundId, optionId,
          acceptedAt: serverTimestamp() });
      });
      return this.answerFrom((await getDoc(answerRef)).data()!);
    });
  }
  expire(code: string, roundId: string): Promise<CommandResult<void>> {
    return this.attempt(async () => {
      const room = (await getDoc(this.roomRef(code))).data() as RemoteRoom;
      if (room.hostId !== this.connection.auth.currentUser!.uid) return;
      if (room.currentRound?.id !== roundId) reject('stale-round');
      if (room.phase !== 'question') return;
      if (projectRoom(room).currentRound!.deadline > Date.now()) reject('invalid-phase');
      const result = await this.revealAnswer(code, roundId);
      if (!result.ok) reject(result.error);
    });
  }
  revealAnswer(code: string, roundId: string): Promise<CommandResult<void>> {
    return this.attempt(async () => {
      for (let retry = 0; retry < 3; retry++) {
        try { await this.publishReveal(code, roundId); return; }
        catch (error) {
          if ((error as { code?: string }).code !== 'permission-denied') throw error;
          // Rules may reject a stale write before the transaction conflict is returned.
          // Only reconcile when another authenticated host operation made progress.
          const latest = (await getDoc(this.roomRef(code))).data() as RemoteRoom;
          if (latest.hostId !== this.connection.auth.currentUser!.uid || latest.currentRound?.id !== roundId) throw error;
          if (latest.phase === 'reveal') return;
          if (!latest.closing || retry === 2) throw error;
        }
      }
    });
  }
  private async publishReveal(code: string, roundId: string): Promise<void> {
      const ref = this.roomRef(code);
      const roundRef = doc(ref, 'rounds', roundId);
      // First commit closure so concurrent or delayed answers cannot enter the scoring set.
      await runTransaction(this.connection.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const room = snapshot.data() as RemoteRoom;
        if (room.hostId !== this.connection.auth.currentUser!.uid) reject('forbidden');
        if (room.currentRound?.id !== roundId) reject('stale-round');
        if (room.phase === 'reveal' || room.closing) return;
        if (room.phase !== 'question') reject('invalid-phase');
        transaction.update(roundRef, { closed: true });
        transaction.update(ref, { closing: true, revision: room.revision + 1 });
      });
      const initial = (await getDoc(ref)).data() as RemoteRoom;
      if (initial.phase === 'reveal') return;
      const [answerDocs, solutionDoc] = await Promise.all([
        getDocs(collection(roundRef, 'answers')),
        getDoc(this.solutionRef(initial)),
      ]);
      const answers = answerDocs.docs.map((entry) => this.answerFrom(entry.data()));
      const solution = (solutionDoc.data()?.['solutions'] as QuestionSolution[] | undefined)
        ?.find((entry) => entry.questionId === initial.currentRound?.questionId);
      if (!solution) reject('content-unavailable');
      await runTransaction(this.connection.db, async (transaction) => {
        const [snapshot, attempt] = await Promise.all([transaction.get(ref), transaction.get(roundRef)]);
        const room = snapshot.data() as RemoteRoom;
        if (room.currentRound?.id !== roundId) reject('stale-round');
        if (attempt.data()?.['scored']) return;
        if (!room.closing || !attempt.data()?.['closed']) reject('invalid-phase');
        const round = projectRoom(room).currentRound!;
        const awards = room.players.map((player) => {
          const answer = answers.find((entry) => entry.playerId === player.id);
          const correct = answer?.optionId === solution.correctOptionId;
          const duration = round.deadline - round.openedAt;
          return { playerId: player.id, correct,
            points: this.scoring.calculate(correct, answer ? round.deadline - answer.acceptedAt : 0,
              duration, room.settings.pointsPerCorrectAnswer, room.settings.speedBonusPoints),
            responseTimeMs: correct && answer ? Math.max(0, Math.min(duration, answer.acceptedAt - round.openedAt)) : 0 };
        });
        const standings = room.players.map((player) => {
          const previous = room.standings.find((entry) => entry.playerId === player.id);
          const award = awards.find((entry) => entry.playerId === player.id)!;
          return { playerId: player.id, displayName: player.displayName, rank: 0, isMock: false,
            totalPoints: (previous?.totalPoints ?? 0) + award.points,
            correctAnswers: (previous?.correctAnswers ?? 0) + Number(award.correct),
            answeredQuestions: (previous?.answeredQuestions ?? 0) + Number(answers.some((entry) => entry.playerId === player.id)),
            correctResponseTimeMs: (previous?.correctResponseTimeMs ?? 0) + award.responseTimeMs };
        }).sort((a, b) => b.totalPoints - a.totalPoints || b.correctAnswers - a.correctAnswers ||
          a.correctResponseTimeMs - b.correctResponseTimeMs ||
          room.players.find((entry) => entry.id === a.playerId)!.joinedOrder - room.players.find((entry) => entry.id === b.playerId)!.joinedOrder)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));
        transaction.update(roundRef, { scored: true });
        transaction.update(ref, { phase: 'reveal', closing: false, standings,
          reveal: { roundId, questionId: round.questionId, index: round.index, solution, awards },
          revision: room.revision + 1 });
      });
  }
  advanceQuestion(code: string, roundId: string) { return this.openRound(code, roundId); }
}
