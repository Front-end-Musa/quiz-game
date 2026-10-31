import { Injectable, inject, isDevMode } from '@angular/core';
import { combineLatest, filter, map } from 'rxjs';
import { GameRoom, RoomSettings } from '../../domain/game-room';
import { defaultRoomSettings, validRoomSettings } from '../../domain/room-settings';
import { GamePlayer } from '../../domain/game-player';
import { QUIZ_REPOSITORY } from '../../ports/quiz-repository';
import { CommandResult, RoomGateway, RoomSnapshot, RoomErrorCode } from '../../ports/room-gateway';
import { SessionContext } from '../../state/session-context';
import { ROOM_STORE, StoredRoom } from './room-store';

const normalize = (name: string) => name.trim().normalize('NFKC').toLocaleLowerCase('ru');
const validName = (name: string) => !!name.trim() && name.trim().length <= 24;
const fail = <T>(error: RoomErrorCode): CommandResult<T> => ({ ok: false, error });

@Injectable()
export class MockRoomGateway implements RoomGateway {
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
  ): Promise<CommandResult<GameRoom>> {
    const quiz = await this.quizzes.get(quizId);
    if (!quiz) return fail('quiz-not-found');
    if (quiz.status === 'placeholder') return fail('content-unavailable');
    if (!validName(hostNickname)) return fail('invalid-name');
    const configuration = settings ?? defaultRoomSettings(quiz);
    if (!validRoomSettings(configuration, quiz)) return fail('invalid-settings');
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
        questionIds: quiz.questionIds.slice(0, configuration.questionCount),
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
        rooms: [...rooms, { room, players: [], hostToken, playerTokens: {} }],
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
  async join(code: string, displayName: string): Promise<CommandResult<GamePlayer>> {
    const token = crypto.randomUUID();
    const result = await this.command<GamePlayer>(
      code,
      (stored) => {
        if (this.isHost(stored)) return { stored, result: fail('host-cannot-join') };
        const credential = this.session.get(stored.room.id);
        const existing = stored.players.find(
          (p) => p.id === credential?.actorId && stored.playerTokens[p.id] === credential?.token,
        );
        if (existing) return { stored, result: { ok: true, value: structuredClone(existing) } };
        return this.addPlayer(stored, displayName, false, token);
      },
      false,
    );
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
      const openedAt = Date.now();
      const room: GameRoom = {
        ...stored.room,
        phase: 'question_open',
        revision: stored.room.revision + 1,
        currentRound: {
          questionId: stored.room.questionIds[0],
          index: 0,
          openedAt,
          deadline: openedAt + stored.room.settings.timeLimitSeconds * 1000,
        },
      };
      return { stored: { ...stored, room }, result: { ok: true, value: structuredClone(room) } };
    });
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
