import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RESULT_REPOSITORY } from '../../core/ports/result-repository';
import { LeaderboardTable } from '../../shared/ui/leaderboard-table';
import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-leaderboard-page',
  imports: [RouterLink, LeaderboardTable, EmptyState],
  template: `<header class="page-heading">
      <p class="eyebrow">Каждая компания — своя история</p>
      <h1>Таблица результатов</h1>
      <p class="lead">Рейтинг внутри каждой игры. Очки разных викторин не смешиваем.</p>
    </header>
    @if (results.isLoading()) {
      <p role="status">Загружаем таблицы…</p>
    } @else if (results.error()) {
      <app-empty-state title="Таблицы не загрузились" message="Попробуйте обновить страницу." />
    } @else {
      @for (result of results.value(); track result.roomId) {
        <section class="panel stack">
          <div class="tile-meta">
            <h2>Комната {{ result.roomCode }}</h2>
            <span class="badge">{{ result.isDemo ? 'Демопример' : 'Игра завершена' }}</span>
          </div>
          <app-leaderboard-table [entries]="result.standings" /><a
            class="text-link"
            [routerLink]="['/results', result.roomCode]"
            >Открыть результаты →</a
          >
        </section>
      } @empty {
        <app-empty-state title="История начинается с вас" message="Завершённых игр пока нет." />
      }
    }`,
})
export class LeaderboardPage {
  private readonly repository = inject(RESULT_REPOSITORY);
  readonly results = resource({ loader: () => this.repository.list() });
}
