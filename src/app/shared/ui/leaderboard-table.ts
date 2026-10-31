import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LeaderboardEntry } from '../../core/domain/game-result';

@Component({
  selector: 'app-leaderboard-table',
  imports: [DecimalPipe],
  template: `<div class="table-scroll">
    <table>
      <caption>
        Итоговый рейтинг игроков
      </caption>
      <thead>
        <tr>
          <th scope="col">Место</th>
          <th scope="col">Игрок</th>
          <th scope="col">Верных</th>
          <th scope="col">Очки</th>
        </tr>
      </thead>
      <tbody>
        @for (entry of entries(); track entry.playerId) {
          <tr>
            <td>{{ entry.rank }}</td>
            <th scope="row">{{ entry.displayName }}</th>
            <td>{{ entry.correctAnswers }}</td>
            <td>{{ entry.totalPoints | number }}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>`,
})
export class LeaderboardTable {
  readonly entries = input.required<readonly LeaderboardEntry[]>();
}
