import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { GameRoom, RoomSettings } from '../domain/game-room';
import { GamePlayer } from '../domain/game-player';

export interface RoomSnapshot {
  readonly room: GameRoom;
  readonly players: readonly GamePlayer[];
  readonly viewerRole: 'host' | 'player' | 'visitor';
  readonly viewerPlayerId?: string;
  readonly persistent: boolean;
}
export type RoomErrorCode =
  | 'invalid-settings'
  | 'quiz-not-found'
  | 'content-unavailable'
  | 'room-not-found'
  | 'room-full'
  | 'name-taken'
  | 'invalid-name'
  | 'game-started'
  | 'forbidden'
  | 'not-enough-players'
  | 'player-not-found'
  | 'host-cannot-join'
  | 'storage-unavailable'
  | 'development-only';
export type CommandResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RoomErrorCode };
export interface RoomGateway {
  observe(code: string): Observable<RoomSnapshot | null>;
  create(
    quizId: string,
    settings?: RoomSettings,
    hostNickname?: string,
  ): Promise<CommandResult<GameRoom>>;
  join(code: string, displayName: string): Promise<CommandResult<GamePlayer>>;
  removePlayer(code: string, playerId: string): Promise<CommandResult<void>>;
  setMinimumPlayers(code: string, minimum: number): Promise<CommandResult<void>>;
  start(code: string): Promise<CommandResult<GameRoom>>;
}
export const ROOM_GATEWAY = new InjectionToken<RoomGateway>('RoomGateway');
