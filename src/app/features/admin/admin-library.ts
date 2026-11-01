import { Component, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminRepository, AdminPage, AdminRow } from '../../core/infrastructure/firebase/admin.repository';
import { Button } from '../../shared/ui/button';
import { adminError } from './admin-error';
@Component({
  selector: 'app-admin-library', imports: [RouterLink, Button], styleUrl: './admin.scss',
  template: `<section class="stack"><div class="admin-heading"><h2>Викторины и черновики</h2><a appButton routerLink="/admin/edit/new">Новая викторина</a></div>
    @if (busy()) { <p role="status">Сохраняем…</p> } @if (error()) { <p role="alert">{{ error() }}</p> }
    @if (data.isLoading()) { <p role="status">Загружаем библиотеку…</p> }
    @else if (data.error()) { <p role="alert">Не удалось загрузить библиотеку. <button (click)="data.reload()">Повторить</button></p> }
    @else if (data.value(); as pages) {
      <h3>Опубликованные наборы</h3>
      @for (row of pages[0].rows; track row.id) {
        <article class="panel admin-heading"><div><h3>{{ row['title'] }}</h3><p>Версия {{ row['version'] }} · {{ row['archived'] ? 'В архиве' : 'В каталоге' }}</p></div>
          <div class="admin-actions"><button class="text-button" [disabled]="busy()" (click)="edit(row.id)">Редактировать</button>
            <button class="text-button" [disabled]="busy()" (click)="edit(row.id, true)">Дублировать</button>
            <button class="text-button" [disabled]="busy()" (click)="archive(row)">{{ row['archived'] ? 'Вернуть в каталог' : 'В архив' }}</button></div></article>
      } @empty { <p>Опубликованных наборов пока нет.</p> }
      <button class="text-button" [disabled]="!publishedCursor()" (click)="nextPublished()">Следующие викторины →</button>
      <h3>Приватные черновики</h3>
      @for (row of pages[1].rows; track row.id) {
        <a class="panel" [routerLink]="['/admin/edit', row.id]">{{ title(row) }} · черновик {{ row['revision'] }}</a>
      } @empty { <p>Черновиков пока нет. Создайте новый набор или отредактируйте опубликованный.</p> }
      <button class="text-button" [disabled]="!draftCursor()" (click)="nextDrafts()">Следующие черновики →</button>
      <button class="text-button" (click)="resetPages()">В начало списка</button>
    }
  </section>`,
})
export class AdminLibrary {
  private readonly repository = inject(AdminRepository);
  private readonly router = inject(Router);
  private readonly cursors = signal<{ published: AdminPage['cursor']; drafts: AdminPage['cursor'] }>({ published: null, drafts: null });
  readonly data = resource({ params: () => this.cursors(), loader: ({ params }) => Promise.all([
    this.repository.page('quizzes', params.published), this.repository.page('adminDrafts', params.drafts),
  ]) });
  readonly busy = signal(false); readonly error = signal('');
  title(row: AdminRow) { return (row['quiz'] as { title: string })?.title || 'Без названия'; }
  publishedCursor() { const page = this.data.value()?.[0]; return page?.rows.length === 20 ? page.cursor : null; }
  draftCursor() { const page = this.data.value()?.[1]; return page?.rows.length === 20 ? page.cursor : null; }
  nextPublished() { this.cursors.update((value) => ({ ...value, published: this.publishedCursor() })); }
  nextDrafts() { this.cursors.update((value) => ({ ...value, drafts: this.draftCursor() })); }
  resetPages() { this.cursors.set({ published: null, drafts: null }); }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await action(); } catch (error) { this.error.set(adminError(error)); } finally { this.busy.set(false); }
  }
  edit(id: string, duplicate = false) { return this.run(async () => {
    const draft = await this.repository.editPublished(id, duplicate);
    await this.router.navigate(['/admin/edit', draft.id]);
  }); }
  archive(row: AdminRow) { return this.run(async () => {
    await this.repository.archiveQuiz(row.id, !row['archived']); this.data.reload();
  }); }
}
