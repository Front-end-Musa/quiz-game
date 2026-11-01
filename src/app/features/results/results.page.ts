import { Component, inject, input, resource } from '@angular/core';
import { RESULT_REPOSITORY } from '../../core/ports/result-repository';
import { ROOM_GATEWAY } from '../../core/ports/room-gateway';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ReplayService } from '../../core/state/replay.service';
import { ResultsSummary } from '../../shared/ui/results-summary';
import { EmptyState } from '../../shared/ui/empty-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Button } from '../../shared/ui/button';

@Component({
  selector: 'app-results-page',
  imports: [ResultsSummary, EmptyState, LoadingState, Button],
  template: `
    @if (result.isLoading()) {
      <app-loading-state label="Собираем финальные результаты…" />
    } @else if (result.error()) {
      <section class="stack">
        <h1>Результаты не загрузились</h1>
        <p role="alert">Не удалось прочитать историю игры. Попробуйте ещё раз.</p>
        <button appButton type="button" (click)="result.reload()">Попробовать снова</button>
      </section>
    } @else if (result.value(); as data) {
      <app-results-summary
        [result]="data"
        [viewerPlayerId]="viewer()?.viewerPlayerId"
        [busy]="replay.busy()"
        [error]="replay.error()"
        (playAgain)="replay.start(data)"
      />
    } @else {
      <app-empty-state
        title="Финал ещё впереди"
        message="У этой комнаты пока нет результатов. Пример можно посмотреть в общей таблице."
        link="/leaderboard"
        label="Посмотреть деморезультаты"
      />
    }
  `,
})
export class ResultsPage {
  readonly roomCode = input.required<string>();
  private readonly results = inject(RESULT_REPOSITORY);
  private readonly rooms = inject(ROOM_GATEWAY);
  readonly viewer = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      switchMap((params) => this.rooms.observe(params.get('roomCode') ?? '')),
    ),
  );
  readonly replay = inject(ReplayService);
  readonly result = resource({
    params: () => this.roomCode(),
    loader: ({ params }) => this.results.getByRoom(params),
  });
}
