import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GameResult } from '../../core/domain/game-result';
import { Button } from './button';
import { Badge } from './badge';
import { LeaderboardTable } from './leaderboard-table';
import { playerStatistics } from './result-statistics';

@Component({
  selector: 'app-results-summary',
  imports: [DecimalPipe, RouterLink, Button, Badge, LeaderboardTable],
  templateUrl: './results-summary.html',
})
export class ResultsSummary {
  readonly result = input.required<GameResult>();
  readonly viewerPlayerId = input<string>();
  readonly busy = input(false);
  readonly error = input('');
  readonly showDetailsLink = input(false);
  readonly playAgain = output<void>();
  readonly winner = computed(() =>
    this.result().standings.find((p) => p.playerId === this.result().winnerId),
  );
  readonly me = computed(() =>
    this.result().standings.find((p) => p.playerId === this.viewerPlayerId()),
  );
  readonly stats = playerStatistics;
  readonly confetti = Array.from({ length: 12 }, (_, i) => i);
}
