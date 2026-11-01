import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LeaderboardEntry } from '../../core/domain/game-result';
import { accuracy } from './result-statistics';

@Component({
  selector: 'app-leaderboard-table',
  imports: [DecimalPipe],
  template: ` <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="caption()">
    <table>
      <caption>
        {{
          caption()
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">Место</th>
          <th scope="col">Игрок</th>
          <th scope="col">Верных</th>
          @if (questionCount() > 0) {
            <th scope="col">Точность</th>
          }
          <th scope="col">Очки</th>
        </tr>
      </thead>
      <tbody>
        @for (entry of entries(); track entry.playerId) {
          <tr [class.my-ranking]="entry.playerId === highlightPlayerId()">
            <td>
              <span class="rank-number" [class.rank-first]="entry.rank === 1">{{
                entry.rank
              }}</span>
            </td>
            <th scope="row">
              <span>{{ entry.displayName }}</span>
              @if (entry.isMock) {
                <span class="table-mock">MOCK</span>
              }
              @if (entry.playerId === highlightPlayerId()) {
                <span class="table-mock">Вы</span>
              }
            </th>
            <td>
              {{ entry.correctAnswers }}
              @if (questionCount() > 0) {
                / {{ questionCount() }}
              }
            </td>
            @if (questionCount() > 0) {
              <td>{{ accuracy(entry, questionCount()) }}%</td>
            }
            <td>
              <strong>{{ entry.totalPoints | number }}</strong>
            </td>
          </tr>
        } @empty {
          <tr>
            <td [attr.colspan]="questionCount() > 0 ? 5 : 4">Игроков пока нет.</td>
          </tr>
        }
      </tbody>
    </table>
  </div>`,
})
export class LeaderboardTable {
  readonly entries = input.required<readonly LeaderboardEntry[]>();
  readonly questionCount = input(0);
  readonly highlightPlayerId = input<string>();
  readonly caption = input('Итоговый рейтинг игроков');
  readonly accuracy = accuracy;
}
