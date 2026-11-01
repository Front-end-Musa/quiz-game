import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameResult } from '../domain/game-result';
import { ROOM_GATEWAY } from '../ports/room-gateway';

@Injectable({ providedIn: 'root' })
export class ReplayService {
  private readonly rooms = inject(ROOM_GATEWAY);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');
  async start(result: GameResult) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const content = result.hasCustomQuestions ? await this.rooms.editableRoomQuestions(result.roomCode) : null;
      if (content && !content.ok) {
        this.error.set('Повторить игру с изменёнными вопросами может её ведущий.'); return;
      }
      const created = await this.rooms.create(result.quizId, result.settings, result.hostNickname, content?.ok ? content.value : undefined);
      if (!created.ok) {
        this.error.set(
          'Не удалось создать новую комнату. Возможно, набор или настройки изменились. Выберите тему из каталога.',
        );
        return;
      }
      await this.router.navigate(['/lobby', created.value.code]);
    } catch {
      this.error.set('Не удалось начать новую игру. Попробуйте ещё раз.');
    } finally {
      this.busy.set(false);
    }
  }
}
