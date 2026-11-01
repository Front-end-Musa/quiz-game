import { PlayerAnswer } from '../domain/player-answer';
import { RoundReveal } from '../domain/round-reveal';
import { LeaderboardEntry, GameResult } from '../domain/game-result';
import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { GameRoom, RoomSettings } from '../domain/game-room';
import { GamePlayer } from '../domain/game-player';
import { QuizQuestion } from '../domain/quiz-question';
import { RoomQuestionSet } from '../domain/room-question-set';

export interface RoomSnapshot {
  readonly room: GameRoom;
  readonly players: readonly GamePlayer[];
  readonly viewerRole: 'host' | 'player' | 'visitor';
  readonly viewerPlayerId?: string;
  readonly persistent: boolean;
  readonly connectionStatus?: 'online' | 'cached';
  readonly closing?: boolean;
  readonly hostOnlyProgression?: boolean;
  readonly ownAnswer: PlayerAnswer | null;
  readonly score: number;
  readonly reveal: RoundReveal | null;
  readonly standings: readonly LeaderboardEntry[];
  readonly result: GameResult | null;
  readonly canUseDevControls: boolean;
}
export type RoomErrorCode =
  | 'host-unavailable'
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
  | 'development-only'
  | 'invalid-phase'
  | 'stale-round'
  | 'already-answered'
  | 'invalid-option'
  | 'answer-too-late';
export type CommandResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RoomErrorCode };
export interface RoomGateway {
  observe(code: string): Observable<RoomSnapshot | null>;
  create(
    quizId: string,
    settings?: RoomSettings,
    hostNickname?: string,
    questions?: RoomQuestionSet,
  ): Promise<CommandResult<GameRoom>>;
  editableQuizQuestions(quizId: string, version: number): Promise<CommandResult<RoomQuestionSet>>;
  editableRoomQuestions(code: string): Promise<CommandResult<RoomQuestionSet>>;
  updateQuestions(code: string, content: RoomQuestionSet): Promise<CommandResult<void>>;
  publicQuestions(code: string): Promise<readonly QuizQuestion[]>;
  join(code: string, displayName: string): Promise<CommandResult<GamePlayer>>;
  removePlayer(code: string, playerId: string): Promise<CommandResult<void>>;
  setMinimumPlayers(code: string, minimum: number): Promise<CommandResult<void>>;
  submitAnswer(
    code: string,
    roundId: string,
    optionId: string,
    commandId: string,
  ): Promise<CommandResult<PlayerAnswer>>;
  expire(code: string, roundId: string): Promise<CommandResult<void>>;
  revealAnswer(code: string, roundId: string): Promise<CommandResult<void>>;
  advanceQuestion(code: string, roundId: string): Promise<CommandResult<void>>;
  start(code: string): Promise<CommandResult<GameRoom>>;
}
export const ROOM_GATEWAY = new InjectionToken<RoomGateway>('RoomGateway');
