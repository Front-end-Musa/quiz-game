import { Component, inject } from '@angular/core';
import { GameFacade } from '../../core/state/game-facade';
import { Button } from '../../shared/ui/button';
import { Badge } from '../../shared/ui/badge';
import { LoadingState } from '../../shared/ui/loading-state';
import { EmptyState } from '../../shared/ui/empty-state';
import { ReplayService } from '../../core/state/replay.service';
import { ResultsSummary } from '../../shared/ui/results-summary';
import { LeaderboardTable } from '../../shared/ui/leaderboard-table';

@Component({
  selector: 'app-game-page',
  providers: [GameFacade],
  imports: [Button, Badge, LoadingState, EmptyState, LeaderboardTable, ResultsSummary],
  templateUrl: './game.page.html',
})
export class GamePage {
  readonly game = inject(GameFacade);
  readonly replay = inject(ReplayService);
  readonly letters = ['А', 'Б', 'В', 'Г'];
}
