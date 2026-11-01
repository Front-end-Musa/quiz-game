import { DEVELOPMENT_TOOLS } from '../ports/development-tools';
import { Injectable, computed, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ROOM_GATEWAY, CommandResult, RoomErrorCode } from '../ports/room-gateway';
import { GameTimingService } from './game-timing.service';

@Injectable()
export class GameFacade {
  private readonly tools = inject(DEVELOPMENT_TOOLS, { optional: true });
  private readonly rooms = inject(ROOM_GATEWAY);
  private readonly timing = inject(GameTimingService);
  readonly frame = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      switchMap((params) => this.timing.watch(params.get('roomCode') ?? '')),
    ),
  );
  readonly state = computed(() => this.frame()?.state);
  readonly question = resource({
    params: () => {
      const state = this.state();
      return state?.room.currentRound
        ? { code: state.room.code, questionId: state.room.currentRound.questionId }
        : undefined;
    },
    loader: async ({ params }) =>
      (await this.rooms.publicQuestions(params.code)).find((q) => q.id === params.questionId) ??
      null,
  });
  readonly correctAnswer = computed(
    () =>
      this.question
        .value()
        ?.options.find((o) => o.id === this.state()?.reveal?.solution.correctOptionId)?.text ?? '—',
  );
  readonly yourAnswer = computed(
    () =>
      this.question.value()?.options.find((o) => o.id === this.state()?.ownAnswer?.optionId)
        ?.text ?? 'Нет ответа',
  );
  readonly player = computed(() =>
    this.state()?.players.find((p) => p.id === this.state()?.viewerPlayerId),
  );
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly pendingOption = signal('');
  readonly selected = computed(() => this.state()?.ownAnswer?.optionId ?? this.pendingOption());
  readonly canAnswer = computed(
    () =>
      this.state()?.viewerRole === 'player' &&
      this.state()?.room.phase === 'question' &&
      !this.state()?.closing &&
      (this.frame()?.remainingMs ?? 0) > 0 &&
      !this.state()?.ownAnswer &&
      !this.pendingOption() &&
      !this.busy(),
  );
  readonly award = computed(() =>
    this.state()?.reveal?.awards.find((a) => a.playerId === this.state()?.viewerPlayerId),
  );
  readonly progress = computed(() => {
    const state = this.state();
    const round = state?.room.currentRound;
    return state && round
      ? ((round.index +
          (state.room.phase === 'reveal' || state.room.phase === 'finished' ? 1 : 0)) /
          state.room.questionIds.length) *
          100
      : 0;
  });

  constructor() {
    let previous: string | undefined;
    effect(() => {
      const id = this.state()?.room.currentRound?.id;
      if (id !== previous) {
        previous = id;
        this.pendingOption.set('');
        this.error.set('');
      }
    });
  }
  private async run<T>(action: () => Promise<CommandResult<T>>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await action();
      if (!result.ok) {
        const messages: Partial<Record<RoomErrorCode, string>> = {
          'already-answered': 'Ответ уже принят. Изменить его нельзя.',
          'answer-too-late': 'Время вышло. Этот ответ не засчитан.',
          'stale-round': 'Вопрос уже изменился. Выберите ответ на текущий вопрос.',
          forbidden: 'Это действие недоступно вашей роли.',
          'invalid-phase': 'Действие недоступно на этом этапе.',
          'invalid-option': 'Такого варианта ответа нет.',
          'storage-unavailable': 'Не удалось сохранить действие. Попробуйте ещё раз.',
        };
        this.error.set(
          messages[result.error] ?? 'Не удалось выполнить действие. Попробуйте ещё раз.',
        );
        this.pendingOption.set('');
      }
    } catch {
      this.error.set('Не удалось сохранить действие. Попробуйте ещё раз.');
      this.pendingOption.set('');
    } finally {
      this.busy.set(false);
    }
  }
  answer(optionId: string) {
    if (!this.canAnswer()) return;
    const state = this.state()!;
    this.pendingOption.set(optionId);
    return this.run(() =>
      this.rooms.submitAnswer(
        state.room.code,
        state.room.currentRound!.id,
        optionId,
        crypto.randomUUID(),
      ),
    );
  }
  reveal() {
    const state = this.state()!;
    return this.run(() => this.rooms.revealAnswer(state.room.code, state.room.currentRound!.id));
  }
  advance() {
    const state = this.state()!;
    return this.run(() => this.rooms.advanceQuestion(state.room.code, state.room.currentRound!.id));
  }
  development(action: 'reveal' | 'advance' | 'restart' | 'finish') {
    if (!this.tools?.enabled) {
      this.error.set('Тестовые действия отключены.');
      return;
    }
    const state = this.state()!;
    return this.run(() =>
      this.tools!.control(state.room.code, action, state.room.currentRound!.id),
    );
  }
}
