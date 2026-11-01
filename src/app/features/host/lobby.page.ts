import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import { ROOM_GATEWAY, CommandResult } from '../../core/ports/room-gateway';
import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { DEVELOPMENT_TOOLS } from '../../core/ports/development-tools';
import { EmptyState } from '../../shared/ui/empty-state';
import { Button } from '../../shared/ui/button';
import { Badge } from '../../shared/ui/badge';
import { LoadingState } from '../../shared/ui/loading-state';
import { RoomQuestionEditor } from '../../shared/ui/room-question-editor';
import { RoomQuestionSet, roomQuestionErrors } from '../../core/domain/room-question-set';

@Component({
  selector: 'app-lobby-page',
  imports: [RouterLink, ReactiveFormsModule, EmptyState, Button, Badge, LoadingState, RoomQuestionEditor],
  templateUrl: './lobby.page.html',
})
export class LobbyPage {
  private readonly rooms = inject(ROOM_GATEWAY);
  private readonly quizzes = inject(QUIZ_REPOSITORY);
  private readonly simulator = inject(DEVELOPMENT_TOOLS, { optional: true });
  private readonly router = inject(Router);
  readonly development = this.simulator?.enabled ?? false;
  readonly previewPlayer = signal(false);
  readonly code = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('roomCode') ?? '')),
    { initialValue: '' },
  );
  readonly snapshot = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      switchMap((params) => this.rooms.observe(params.get('roomCode') ?? '')),
    ),
  );
  readonly quiz = resource({
    params: () => this.snapshot()?.room.quizId,
    loader: ({ params }) => this.quizzes.get(params),
  });
  readonly hostView = computed(
    () => this.snapshot()?.viewerRole === 'host' && !this.previewPlayer(),
  );
  readonly mockCount = computed(() => this.snapshot()?.players.filter((p) => p.isMock).length ?? 0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly initialQuestions = signal<RoomQuestionSet | null>(null);
  readonly editedQuestions = signal<RoomQuestionSet | null>(null);
  readonly questionsDirty = signal(false);
  readonly nickname = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(24), Validators.pattern(/\S/)],
  });
  readonly minimum = new FormControl(2, { nonNullable: true });

  constructor() {
    effect(() => {
      const state = this.snapshot();
      if (state) this.minimum.setValue(state.room.settings.minPlayers);
    });
    effect(() => {
      const state = this.snapshot();
      if (state && state.room.phase !== 'lobby' && state.viewerRole !== 'visitor')
        void this.router.navigate(['/game', state.room.code]);
    });
  }
  private async run<T>(action: () => Promise<CommandResult<T>>, success: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const result = await action();
      if (result.ok) this.notice.set(success);
      else {
        const messages: Partial<
          Record<import('../../core/ports/room-gateway').RoomErrorCode, string>
        > = {
          'room-full': 'Все места заняты. Удалите игрока, прежде чем добавлять нового.',
          'name-taken': 'Это имя уже занято игроком или ведущим.',
          'invalid-name': 'Введите имя от 1 до 24 символов.',
          forbidden: 'Управлять комнатой может только её ведущий.',
          'not-enough-players': 'Игроков пока недостаточно для старта.',
          'game-started': 'Игра уже началась. Состав лобби заблокирован.',
          'invalid-settings': 'Минимум должен быть целым числом от 2 до максимума комнаты.',
          'storage-unavailable': 'Не удалось сохранить изменение. Проверьте соединение и попробуйте ещё раз.',
        };
        this.error.set(
          messages[result.error] ?? 'Не удалось выполнить действие. Обновите состояние комнаты.',
        );
      }
    } catch {
      this.error.set('Не удалось выполнить действие. Попробуйте ещё раз.');
    } finally {
      this.busy.set(false);
    }
  }
  async randomNickname() {
    if (!this.simulator?.enabled) return;
    try {
      this.nickname.setValue(await this.simulator.nickname(this.code()));
    } catch {
      this.error.set('Не удалось подобрать имя. Введите его вручную.');
    }
  }
  async addMock() {
    if (!this.simulator?.enabled) return;
    this.nickname.markAsTouched();
    if (this.nickname.invalid) return;
    await this.run(
      () => this.simulator!.add(this.code(), this.nickname.value),
      'Mock-игрок добавлен.',
    );
    if (!this.error()) this.nickname.reset('');
  }
  remove(id: string) {
    return this.run(() => this.rooms.removePlayer(this.code(), id), 'Игрок удалён из лобби.');
  }
  resetMocks() {
    if (!this.simulator?.enabled) return;
    return this.run(
      () => this.simulator!.reset(this.code()),
      'Симулированные игроки удалены. Локальные участники сохранены.',
    );
  }
  applyMinimum() {
    return this.run(
      () => this.rooms.setMinimumPlayers(this.code(), this.minimum.value),
      'Минимум игроков обновлён.',
    );
  }
  playLocally() {
    if (!this.simulator?.enabled) return;
    if (this.questionsDirty()) { this.error.set('Сначала сохраните вопросы или отмените изменения.'); return; }
    return this.run(() => this.simulator!.playLocally(this.code()), 'Локальная игра началась.');
  }
  start() {
    if (this.questionsDirty()) { this.error.set('Сначала сохраните вопросы или отмените изменения.'); return; }
    return this.run(() => this.rooms.start(this.code()), 'Игра началась!');
  }
  async editQuestions() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.rooms.editableRoomQuestions(this.code());
      if (!result.ok) { this.error.set('Вопросы может редактировать только создатель комнаты.'); return; }
      this.initialQuestions.set(result.value); this.editedQuestions.set(null); this.questionsDirty.set(false);
    } catch { this.error.set('Вопросы не загрузились. Проверьте соединение.'); }
    finally { this.busy.set(false); }
  }
  cancelQuestions() {
    this.initialQuestions.set(null); this.editedQuestions.set(null); this.questionsDirty.set(false); this.error.set('');
  }
  async saveQuestions() {
    const content = this.editedQuestions();
    const quizId = this.snapshot()?.room.quizId;
    if (this.busy() || !content || !quizId) return;
    const errors = roomQuestionErrors(content, quizId);
    if (errors.length) { this.error.set(errors.join(' ')); return; }
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.rooms.updateQuestions(this.code(), content);
      if (!result.ok) {
        this.error.set(result.error === 'game-started' ? 'Игра уже началась. Вопросы заблокированы.' :
          result.error === 'invalid-settings' ? 'Вопросы изменились в другой вкладке. Откройте редактор заново.' : 'Не удалось сохранить вопросы.');
        return;
      }
      this.cancelQuestions(); this.notice.set('Вопросы сохранены только для этой комнаты. Можно начинать игру.');
    } catch { this.error.set('Не удалось сохранить вопросы. Проверьте соединение.'); }
    finally { this.busy.set(false); }
  }
  async copyCode() {
    try {
      await navigator.clipboard.writeText(this.snapshot()!.room.code);
      this.notice.set('Код скопирован.');
    } catch {
      this.notice.set('Скопируйте код из поля комнаты вручную.');
    }
  }
}
