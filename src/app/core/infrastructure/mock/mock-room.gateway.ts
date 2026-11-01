import { normalizeNickname as normalize } from '../../domain/nickname';
import { LocalGameEngine } from './local-game-engine';
import { GAME_CLOCK } from '../../state/game-clock';
import { PlayerAnswer } from '../../domain/player-answer';
import { MOCK_QUESTIONS, MOCK_SOLUTIONS } from '../../../content/quizzes/quizzes.mock';
import { Injectable, inject, isDevMode } from '@angular/core';
import { combineLatest, filter, firstValueFrom, map } from 'rxjs';
import { RoomQuestionSet, roomQuestionErrors } from '../../domain/room-question-set';
import { GameRoom, RoomSettings } from '../../domain/game-room';
import { defaultRoomSettings, validRoomSettings } from '../../domain/room-settings';
import { GamePlayer } from '../../domain/game-player';
import { QUIZ_REPOSITORY } from '../../ports/quiz-repository';
import { CommandResult, RoomGateway, RoomSnapshot, RoomErrorCode } from '../../ports/room-gateway';
import { SessionContext } from '../../state/session-context';
import { ROOM_STORE, StoredRoom } from './room-store';

const validName = (name: string) => !!name.trim() && name.trim().length <= 24;
const fail = <T>(error: RoomErrorCode): CommandResult<T> => ({ ok: false, error });

@Injectable()
export class MockRoomGateway implements RoomGateway {
  private readonly engine = inject(LocalGameEngine);
  private readonly clock = inject(GAME_CLOCK);
  private readonly quizzes = inject(QUIZ_REPOSITORY);
  private readonly store = inject(ROOM_STORE);
  private readonly session = inject(SessionContext);

  observe(code: string) {
    return combineLatest([
      this.store.changes.pipe(filter((rooms) => rooms !== undefined)),
      this.session.changes,
    ]).pipe(
      map(([rooms]) => {
        const stored = rooms.find((s) => s.room.code === code.trim().toUpperCase());
        if (!stored) return null;
        const credential = this.session.get(stored.room.id);
        const host = this.isHost(stored);
        const player =
          credential?.role === 'player' &&
          stored.playerTokens[credential.actorId] === credential.token &&
          stored.players.some((p) => p.id === credential.actorId);
        return structuredClone({
          room: stored.room,
          players: stored.players,
          viewerRole: host ? 'host' : player ? 'player' : 'visitor',
          viewerPlayerId: player ? credential.actorId : undefined,
          persistent: this.store.persistent,
          ownAnswer: player
            ? (stored.answers.find(
                (a) =>
                  a.playerId === credential.actorId && a.roundId === stored.room.currentRound?.id,
              ) ?? null)
            : null,
          score: player
            ? (this.engine.standings(stored).find((e) => e.playerId === credential.actorId)
                ?.totalPoints ?? 0)
            : 0,
          reveal:
            stored.room.phase === 'reveal'
              ? (stored.reveals.find((r) => r.roundId === stored.room.currentRound?.id) ?? null)
              : null,
          standings: this.engine.standings(stored),
          result: stored.result,
          canUseDevControls: isDevMode() && (host || this.hasController(stored)),
        }) as RoomSnapshot;
      }),
    );
  }
  private isHost(stored: StoredRoom) {
    const credential = this.session.get(stored.room.id);
    return (
      credential?.role === 'host' &&
      credential.actorId === stored.room.hostId &&
      credential.token === stored.hostToken
    );
  }
  private async transaction<T>(
    change: (rooms: readonly StoredRoom[]) => {
      rooms: readonly StoredRoom[];
      result: CommandResult<T>;
    },
  ): Promise<CommandResult<T>> {
    try {
      return await this.store.transact(change);
    } catch {
      return fail('storage-unavailable');
    }
  }
  private command<T>(
    code: string,
    action: (stored: StoredRoom) => { stored: StoredRoom; result: CommandResult<T> },
    hostOnly = true,
  ) {
    return this.transaction<T>((rooms) => {
      const stored = rooms.find((s) => s.room.code === code.trim().toUpperCase());
      if (!stored) return { rooms, result: fail('room-not-found') };
      if (hostOnly && !this.isHost(stored)) return { rooms, result: fail('forbidden') };
      if (stored.room.phase !== 'lobby') return { rooms, result: fail('game-started') };
      const next = action(stored);
      return {
        rooms: rooms.map((s) => (s.room.id === stored.room.id ? next.stored : s)),
        result: next.result,
      };
    });
  }
  async create(
    quizId: string,
    settings?: RoomSettings,
    hostNickname = 'Ведущий',
    content?: RoomQuestionSet,
  ): Promise<CommandResult<GameRoom>> {
    const quiz = await this.quizzes.get(quizId);
    if (!quiz) return fail('quiz-not-found');
    if (quiz.status === 'placeholder' && !content) return fail('content-unavailable');
    if (!validName(hostNickname)) return fail('invalid-name');
    const configuration = settings ?? { ...defaultRoomSettings(quiz), questionCount: content?.questions.length ?? quiz.questionIds.length };
    if (content && roomQuestionErrors(content, quizId).length) return fail('invalid-settings');
    if (!validRoomSettings(configuration, content ? { questionIds: content.questions.map((question) => question.id) } : quiz) ||
      content && configuration.questionCount !== content.questions.length) return fail('invalid-settings');
    const hostToken = crypto.randomUUID();
    const result = await this.transaction<GameRoom>((rooms) => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code: string;
      do {
        code = Array.from(
          crypto.getRandomValues(new Uint8Array(6)),
          (n) => alphabet[n % alphabet.length],
        ).join('');
      } while (rooms.some((s) => s.room.code === code));
      const room: GameRoom = {
        id: crypto.randomUUID(),
        code,
        quizId,
        quizVersion: quiz.version,
        questionIds: content ? content.questions.map((question) => question.id) : quiz.questionIds.slice(0, configuration.questionCount),
        hasCustomQuestions: !!content, contentRevision: content ? 1 : 0,
        hostId: crypto.randomUUID(),
        hostNickname: hostNickname.trim(),
        nextJoinOrder: 1,
        phase: 'lobby',
        playerIds: [],
        settings: structuredClone(configuration),
        createdAt: Date.now(),
        revision: 0,
        currentRound: null,
      };
      return {
        rooms: [
          ...rooms,
          {
            room,
            players: [],
            answers: [],
            reveals: [],
            result: null,
            hostToken,
            playerTokens: {},
            ...(content ? { customContent: structuredClone(content) } : {}),
          },
        ],
        result: { ok: true, value: structuredClone(room) },
      };
    });
    if (result.ok)
      this.session.set(result.value.id, {
        actorId: result.value.hostId,
        token: hostToken,
        role: 'host',
      });
    return result;
  }
  async editableQuizQuestions(quizId: string, version: number): Promise<CommandResult<RoomQuestionSet>> {
    const quiz = await this.quizzes.get(quizId);
    if (!quiz || quiz.version !== version) return fail('quiz-not-found');
    return { ok: true, value: { questions: await this.quizzes.getQuestions(quizId, version),
      solutions: MOCK_SOLUTIONS.filter((solution) => quiz.questionIds.includes(solution.questionId)), reviewed: false, revision: 0 } };
  }
  private async storedRoom(code: string) {
    return (await firstValueFrom(this.store.changes.pipe(filter((rooms) => rooms !== undefined))))
      .find((stored) => stored.room.code === code.trim().toUpperCase());
  }
  async publicQuestions(code: string) {
    const stored = await this.storedRoom(code);
    if (!stored || !this.isHost(stored) && !this.isPlayer(stored)) throw new Error('Нет доступа к комнате.');
    const questions = stored.customContent?.questions ?? MOCK_QUESTIONS;
    return stored.room.questionIds.map((id) => questions.find((question) => question.id === id)!).filter(Boolean);
  }
  async editableRoomQuestions(code: string): Promise<CommandResult<RoomQuestionSet>> {
    const stored = await this.storedRoom(code);
    if (!stored) return fail('room-not-found');
    if (!this.isHost(stored)) return fail('forbidden');
    return { ok: true, value: { questions: await this.publicQuestions(code),
      solutions: stored.room.questionIds.map((id) => this.engine.solution(id, stored)!).filter(Boolean),
      reviewed: !!stored.customContent, revision: stored.room.contentRevision ?? 0 } };
  }
  updateQuestions(code: string, content: RoomQuestionSet): Promise<CommandResult<void>> {
    return this.command(code, (stored) => {
      if (roomQuestionErrors(content, stored.room.quizId).length || content.revision !== (stored.room.contentRevision ?? 0))
        return { stored, result: fail('invalid-settings') };
      return { stored: { ...stored, customContent: structuredClone(content), room: { ...stored.room,
        questionIds: content.questions.map((question) => question.id), hasCustomQuestions: true,
        contentRevision: (stored.room.contentRevision ?? 0) + 1,
        settings: { ...stored.room.settings, questionCount: content.questions.length }, revision: stored.room.revision + 1 } },
        result: { ok: true, value: undefined } };
    });
  }
  async join(code: string, displayName: string): Promise<CommandResult<GamePlayer>> {
    const token = crypto.randomUUID();
    const result = await this.transaction<GamePlayer>((rooms) => {
      const stored = rooms.find((s) => s.room.code === code.trim().toUpperCase());
      if (!stored) return { rooms, result: fail('room-not-found') };
      if (this.isHost(stored)) return { rooms, result: fail('host-cannot-join') };
      const credential = this.session.get(stored.room.id);
      const existing = this.isPlayer(stored)
        ? stored.players.find((p) => p.id === credential!.actorId)
        : undefined;
      if (existing) return { rooms, result: { ok: true, value: structuredClone(existing) } };
      if (stored.room.phase !== 'lobby') return { rooms, result: fail('game-started') };
      const next = this.addPlayer(stored, displayName, false, token);
      return {
        rooms: rooms.map((s) => (s.room.id === stored.room.id ? next.stored : s)),
        result: next.result,
      };
    });
    if (result.ok) {
      // Rejoin keeps its original credential; new membership receives the new token.
      if (this.session.get(result.value.roomId)?.actorId !== result.value.id)
        this.session.set(result.value.roomId, { actorId: result.value.id, token, role: 'player' });
    }
    return result;
  }
  private addPlayer(
    stored: StoredRoom,
    name: string,
    isMock: boolean,
    token?: string,
  ): { stored: StoredRoom; result: CommandResult<GamePlayer> } {
    const reject = (error: RoomErrorCode) => ({ stored, result: fail<GamePlayer>(error) });
    if (!validName(name)) return reject('invalid-name');
    if (
      normalize(stored.room.hostNickname) === normalize(name) ||
      stored.players.some((p) => normalize(p.displayName) === normalize(name))
    )
      return reject('name-taken');
    if (stored.players.length >= stored.room.settings.maxPlayers) return reject('room-full');
    const player: GamePlayer = {
      id: crypto.randomUUID(),
      roomId: stored.room.id,
      displayName: name.trim(),
      joinedOrder: stored.room.nextJoinOrder,
      connectionStatus: 'connected',
      participationStatus: 'active',
      isMock,
    };
    return {
      stored: {
        ...stored,
        room: {
          ...stored.room,
          nextJoinOrder: stored.room.nextJoinOrder + 1,
          playerIds: [...stored.room.playerIds, player.id],
          revision: stored.room.revision + 1,
        },
        players: [...stored.players, player],
        playerTokens: token ? { ...stored.playerTokens, [player.id]: token } : stored.playerTokens,
      },
      result: { ok: true, value: structuredClone(player) },
    };
  }
  removePlayer(code: string, playerId: string): Promise<CommandResult<void>> {
    return this.command(code, (stored) => {
      if (!stored.players.some((p) => p.id === playerId))
        return { stored, result: fail('player-not-found') };
      const tokens = { ...stored.playerTokens };
      delete tokens[playerId];
      return {
        stored: {
          ...stored,
          players: stored.players.filter((p) => p.id !== playerId),
          playerTokens: tokens,
          room: {
            ...stored.room,
            playerIds: stored.room.playerIds.filter((id) => id !== playerId),
            revision: stored.room.revision + 1,
          },
        },
        result: { ok: true, value: undefined },
      };
    });
  }
  setMinimumPlayers(code: string, minimum: number): Promise<CommandResult<void>> {
    return this.command(code, (stored) => {
      if (!Number.isInteger(minimum) || minimum < 2 || minimum > stored.room.settings.maxPlayers)
        return { stored, result: fail('invalid-settings') };
      return {
        stored: {
          ...stored,
          room: {
            ...stored.room,
            settings: { ...stored.room.settings, minPlayers: minimum },
            revision: stored.room.revision + 1,
          },
        },
        result: { ok: true, value: undefined },
      };
    });
  }
  async start(code: string): Promise<CommandResult<GameRoom>> {
    return this.command(code, (stored) => {
      if (stored.players.length < stored.room.settings.minPlayers)
        return { stored, result: fail('not-enough-players') };
      if (!stored.room.questionIds.every((id) => this.engine.solution(id, stored)))
        return { stored, result: fail('content-unavailable') };
      const opened = this.engine.open(stored, 0);
      return { stored: opened, result: { ok: true, value: structuredClone(opened.room) } };
    });
  }
  private hasController(stored: StoredRoom) {
    const controller = this.session.get('controller:' + stored.room.id);
    return (
      controller?.actorId === stored.room.hostId &&
      controller.token === stored.hostToken &&
      controller.role === 'host'
    );
  }
  private isPlayer(stored: StoredRoom) {
    const credential = this.session.get(stored.room.id);
    return (
      credential?.role === 'player' &&
      stored.playerTokens[credential.actorId] === credential.token &&
      stored.players.some((p) => p.id === credential.actorId && !p.isMock)
    );
  }
  private gameCommand<T>(
    code: string,
    action: (stored: StoredRoom) => { stored: StoredRoom; result: CommandResult<T> },
    permission: 'host' | 'member' | 'developer' = 'host',
  ) {
    return this.transaction<T>((rooms) => {
      const stored = rooms.find((s) => s.room.code === code.trim().toUpperCase());
      if (!stored) return { rooms, result: fail('room-not-found') };
      const allowed =
        permission === 'host'
          ? this.isHost(stored)
          : permission === 'member'
            ? this.isHost(stored) || this.isPlayer(stored)
            : isDevMode() && (this.isHost(stored) || this.hasController(stored));
      if (!allowed)
        return {
          rooms,
          result: fail(
            permission === 'developer' && !isDevMode() ? 'development-only' : 'forbidden',
          ),
        };
      const next = action(stored);
      return {
        rooms: rooms.map((s) => (s.room.id === stored.room.id ? next.stored : s)),
        result: next.result,
      };
    });
  }
  submitAnswer(
    code: string,
    roundId: string,
    optionId: string,
    commandId: string,
  ): Promise<CommandResult<PlayerAnswer>> {
    return this.gameCommand(
      code,
      (stored) => {
        if (!this.isPlayer(stored)) return { stored, result: fail('forbidden') };
        const playerId = this.session.get(stored.room.id)!.actorId;
        const previous = stored.answers.find(
          (a) => a.playerId === playerId && a.roundId === roundId,
        );
        if (previous)
          return {
            stored,
            result:
              previous.commandId === commandId && previous.optionId === optionId
                ? { ok: true, value: structuredClone(previous) }
                : fail('already-answered'),
          };
        const round = stored.room.currentRound;
        if (!round || round.id !== roundId) return { stored, result: fail('stale-round') };
        if (stored.room.phase !== 'question') return { stored, result: fail('invalid-phase') };
        const acceptedAt = this.clock.now();
        if (acceptedAt >= round.deadline)
          return { stored: this.engine.reveal(stored), result: fail('answer-too-late') };
        if (
          !commandId ||
          commandId.length > 128 ||
          !(stored.customContent?.questions ?? MOCK_QUESTIONS).find((q) => q.id === round.questionId)?.options.some(
            (o) => o.id === optionId,
          )
        )
          return { stored, result: fail('invalid-option') };
        const answer: PlayerAnswer = {
          id: crypto.randomUUID(),
          commandId,
          roomId: stored.room.id,
          playerId,
          questionId: round.questionId,
          roundIndex: round.index,
          roundId,
          optionId,
          acceptedAt,
        };
        return {
          stored: {
            ...stored,
            answers: [...stored.answers, answer],
            room: { ...stored.room, revision: stored.room.revision + 1 },
          },
          result: { ok: true, value: structuredClone(answer) },
        };
      },
      'member',
    );
  }
  expire(code: string, roundId: string): Promise<CommandResult<void>> {
    return this.gameCommand(
      code,
      (stored) => {
        if (stored.room.currentRound?.id !== roundId)
          return { stored, result: fail('stale-round') };
        if (stored.room.phase === 'reveal')
          return { stored, result: { ok: true, value: undefined } };
        if (
          stored.room.phase !== 'question' ||
          this.clock.now() < stored.room.currentRound.deadline
        )
          return { stored, result: fail('invalid-phase') };
        return { stored: this.engine.reveal(stored), result: { ok: true, value: undefined } };
      },
      'member',
    );
  }
  revealAnswer(code: string, roundId: string) {
    return this.control(code, 'reveal', false, roundId);
  }
  advanceQuestion(code: string, roundId: string) {
    return this.control(code, 'advance', false, roundId);
  }
  developerAction(
    code: string,
    action: 'reveal' | 'advance' | 'restart' | 'finish',
    roundId: string,
  ) {
    return this.control(code, action, true, roundId);
  }
  private control(
    code: string,
    action: 'reveal' | 'advance' | 'restart' | 'finish',
    developer: boolean,
    roundId: string,
  ): Promise<CommandResult<void>> {
    return this.gameCommand(
      code,
      (stored) => {
        if (stored.room.currentRound?.id !== roundId)
          return { stored, result: fail('stale-round') };
        if (!stored.room.currentRound || !['question', 'reveal'].includes(stored.room.phase))
          return { stored, result: fail('invalid-phase') };
        if (
          (action === 'reveal' && stored.room.phase !== 'question') ||
          (action === 'advance' && stored.room.phase !== 'reveal')
        )
          return { stored, result: fail('invalid-phase') };
        const next =
          action === 'reveal'
            ? this.engine.reveal(stored)
            : action === 'advance'
              ? this.engine.advance(stored)
              : action === 'restart'
                ? this.engine.restart(stored)
                : this.engine.finish(stored);
        return { stored: next, result: { ok: true, value: undefined } };
      },
      developer ? 'developer' : 'host',
    );
  }
  async playLocally(code: string, nickname = 'Игрок (тест)'): Promise<CommandResult<void>> {
    if (!isDevMode()) return fail('development-only');
    const token = crypto.randomUUID();
    let controller: import('../../state/session-context').RoomCredential | undefined;
    const result = await this.command<GamePlayer>(code, (stored) => {
      controller = this.session.get(stored.room.id);
      const added = this.addPlayer(stored, nickname, false, token);
      if (!added.result.ok) return added;
      let next = added.stored;
      while (next.players.length < next.room.settings.minPlayers) {
        let suffix = next.room.nextJoinOrder;
        let name = `Макет ${suffix}`;
        while (
          next.players.some((p) => normalize(p.displayName) === normalize(name)) ||
          normalize(next.room.hostNickname) === normalize(name)
        )
          name = `Макет ${++suffix}`;
        const mock = this.addPlayer(next, name, true);
        if (!mock.result.ok) return { stored, result: mock.result };
        next = mock.stored;
      }
      return { stored: this.engine.open(next, 0), result: added.result };
    });
    if (!result.ok) return result;
    this.session.set('controller:' + result.value.roomId, controller!);
    this.session.set(result.value.roomId, { actorId: result.value.id, token, role: 'player' });
    return { ok: true, value: undefined };
  }
  addSimulated(code: string, name: string): Promise<CommandResult<GamePlayer>> {
    if (!isDevMode()) return Promise.resolve(fail('development-only'));
    return this.command(code, (stored) => this.addPlayer(stored, name, true));
  }
  resetSimulated(code: string): Promise<CommandResult<void>> {
    if (!isDevMode()) return Promise.resolve(fail('development-only'));
    return this.command(code, (stored) => ({
      stored: {
        ...stored,
        players: stored.players.filter((p) => !p.isMock),
        room: {
          ...stored.room,
          playerIds: stored.players.filter((p) => !p.isMock).map((p) => p.id),
          revision: stored.room.revision + 1,
        },
      },
      result: { ok: true, value: undefined },
    }));
  }
}
