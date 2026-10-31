import { Component, inject, input, resource } from '@angular/core';
import { RESULT_REPOSITORY } from '../../core/ports/result-repository';
import { LeaderboardTable } from '../../shared/ui/leaderboard-table';
import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-results-page',
  imports: [LeaderboardTable, EmptyState],
  template: `<header class="page-heading">
      <p class="eyebrow">Финальный аккорд</p>
      <h1>Вот это компания!</h1>
    </header>
    @if (result.isLoading()) {
      <p role="status">Загружаем результаты…</p>
    } @else if (result.error()) {
      <app-empty-state
        title="Результаты не загрузились"
        message="Попробуйте открыть страницу ещё раз."
      />
    } @else if (result.value(); as gameResult) {
      <p class="notice">
        {{
          gameResult.isDemo
            ? 'Демонстрационные результаты: это пример, а не сыгранная сессия.'
            : 'Игра завершена.'
        }}
      </p>
      <app-leaderboard-table [entries]="gameResult.standings" />
    } @else {
      <app-empty-state
        title="Финал ещё впереди"
        message="У этой комнаты пока нет результатов. Пример можно посмотреть в общей таблице."
        link="/leaderboard"
        label="Посмотреть деморезультаты"
      />
    }`,
})
export class ResultsPage {
  readonly roomCode = input.required<string>();
  private readonly results = inject(RESULT_REPOSITORY);
  readonly result = resource({
    params: () => this.roomCode(),
    loader: ({ params }) => this.results.getByRoom(params),
  });
}
