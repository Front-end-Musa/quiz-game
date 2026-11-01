import { InjectionToken } from '@angular/core';
import { CommandResult } from './room-gateway';
import { GamePlayer } from '../domain/game-player';

export type DevelopmentAction = 'reveal' | 'advance' | 'restart' | 'finish';
/** Optional local/emulator tools, never a production Firebase authority. */
export interface DevelopmentTools {
  readonly enabled: boolean;
  add(code: string, name: string): Promise<CommandResult<GamePlayer>>;
  reset(code: string): Promise<CommandResult<void>>;
  nickname(code: string): Promise<string>;
  playLocally(code: string): Promise<CommandResult<void>>;
  control(code: string, action: DevelopmentAction, roundId: string): Promise<CommandResult<void>>;
}
export const DEVELOPMENT_TOOLS = new InjectionToken<DevelopmentTools>('DevelopmentTools');
