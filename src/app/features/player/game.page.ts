import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { Component, inject, resource } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ROOM_GATEWAY } from '../../core/ports/room-gateway';
import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-game-page',
  imports: [RouterLink, EmptyState],
  template: `@if (snapshot() === undefined) {
      <p role="status">Загружаем комнату…</p>
    } @else if (snapshot(); as state) {
      <header class="page-heading">
        <p class="eyebrow">Комната {{ state.room.code }}</p>
        <h1>{{ state.room.phase === 'lobby' ? 'Здесь будет игра' : 'Игра началась!' }}</h1>
        <p class="lead">Основа готова. Вопросы, таймер и ответы подключим следующим этапом.</p>
      </header>
      <section class="notice stack">
        @if (state.room.currentRound; as round) {
          <p class="eyebrow">Раунд {{ round.index + 1 }} / {{ state.room.questionIds.length }}</p>
          <h2>{{ question.value()?.prompt ?? 'Готовим первый вопрос…' }}</h2>
          <p>Ведущий: {{ state.room.hostNickname }}. Старт сохранён в комнате.</p>
        } @else {
          <h2>Пока собираемся в лобби</h2>
        }
        <p>Этот экран ещё не проводит раунды и не начисляет очки.</p>
        <a class="button secondary" [routerLink]="['/lobby', state.room.code]"
          >Вернуться к компании</a
        >
      </section>
    } @else {
      <app-empty-state
        title="Комната не найдена"
        message="Проверьте код или откройте демокомнату."
        link="/lobby/DEMO22"
        label="Открыть демокомнату"
      />
    }`,
})
export class GamePage {
  private readonly rooms = inject(ROOM_GATEWAY);
  private readonly quizzes = inject(QUIZ_REPOSITORY);
  readonly snapshot = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      switchMap((params) => this.rooms.observe(params.get('roomCode') ?? '')),
    ),
  );
  readonly question = resource({
    params: () => {
      const state = this.snapshot();
      return state?.room.currentRound
        ? { quizId: state.room.quizId, questionId: state.room.currentRound.questionId }
        : undefined;
    },
    loader: async ({ params }) =>
      (await this.quizzes.getQuestions(params.quizId)).find((q) => q.id === params.questionId) ??
      null,
  });
}
