import { Component, inject, resource, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { AdminPage, AdminRepository, AdminRow } from '../../core/infrastructure/firebase/admin.repository';
import { adminError } from './admin-error';
@Component({
  selector: 'app-admin-sessions', imports: [JsonPipe], styleUrl: './admin.scss',
  template: `<section class="stack"><h2>Комнаты и результаты</h2><p>Просмотр до 20 записей за страницу. Счёт и ответы здесь не редактируются.</p>
    <div class="admin-actions"><button class="text-button" (click)="change('rooms')">Комнаты</button><button class="text-button" (click)="change('results')">Результаты</button></div>
    @if (data.isLoading()) { <p role="status">Загружаем записи…</p> }
    @else if (data.error()) { <p role="alert">Записи не загрузились.</p> }
    @else if (data.value(); as page) {
      @for (row of page.rows; track row.id) {
        <article class="panel stack"><h3>Комната {{ row['code'] ?? row.id }}</h3>
          @if (kind() === 'rooms') {
            <p>{{ row['phase'] }} · {{ row['archived'] ? 'В архиве' : 'Не архивирована' }}</p>
            @if (row['phase'] === 'finished' && !row['archived']) { <button class="text-button" [disabled]="busy()" (click)="archive(row.id)">Архивировать завершённую игру</button> }
          }
          <details><summary>Подробности и участники</summary><pre class="admin-record">{{ row | json }}</pre></details>
        </article>
      } @empty { <p>Записей пока нет.</p> }
      <div class="admin-actions"><button class="text-button" (click)="reset()">В начало списка</button>
        <button class="text-button" [disabled]="page.rows.length < 20" (click)="next(page)">Следующие записи →</button></div>
    }
    @if (error()) { <p role="alert">{{ error() }}</p> }
  </section>`,
})
export class AdminSessions {
  private readonly repository = inject(AdminRepository);
  readonly kind = signal<'rooms' | 'results'>('rooms');
  private readonly cursor = signal<AdminPage['cursor']>(null);
  readonly data = resource({ params: () => ({ kind: this.kind(), cursor: this.cursor() }), loader: ({ params }) => this.repository.page(params.kind, params.cursor) });
  readonly error = signal(''); readonly busy = signal(false);
  change(kind: 'rooms' | 'results') { this.cursor.set(null); this.kind.set(kind); }
  reset() { this.cursor.set(null); }
  next(page: AdminPage) { this.cursor.set(page.cursor); }
  async archive(code: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.repository.archiveSession(code); this.data.reload(); }
    catch (error) { this.error.set(adminError(error)); } finally { this.busy.set(false); }
  }
}
