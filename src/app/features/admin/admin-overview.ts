import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminRepository } from '../../core/infrastructure/firebase/admin.repository';
@Component({
  selector: 'app-admin-overview', imports: [RouterLink], styleUrl: './admin.scss',
  template: `<section class="stack"><h2>Всё для следующей игры</h2><p>Готовьте вопросы в черновиках, проверяйте ответы и публикуйте новую версию.</p>
    @if (data.isLoading()) { <p role="status">Загружаем обзор…</p> }
    @else if (data.error()) { <p role="alert">Обзор недоступен. Обновите страницу или войдите заново.</p> }
    @else if (data.value(); as overview) {
      <div class="admin-grid">
        <a class="panel stack" routerLink="/admin/quizzes"><h3>Викторины</h3><strong>{{ overview[0].rows.length }}{{ overview[0].rows.length === 20 ? '+' : '' }}</strong><span>Опубликованные наборы и архив</span></a>
        <a class="panel stack" routerLink="/admin/quizzes"><h3>Черновики</h3><strong>{{ overview[1].rows.length }}{{ overview[1].rows.length === 20 ? '+' : '' }}</strong><span>Приватная подготовка вопросов</span></a>
        <a class="panel stack" routerLink="/admin/sessions"><h3>Последние комнаты</h3><strong>{{ overview[2].rows.length }}{{ overview[2].rows.length === 20 ? '+' : '' }}</strong><span>До 20 последних записей</span></a>
      </div>
    }
    <a class="text-link" routerLink="/admin/edit/new">Создать викторину →</a>
  </section>`,
})
export class AdminOverview {
  private readonly repository = inject(AdminRepository);
  readonly data = resource({ loader: () => Promise.all([this.repository.page('quizzes'), this.repository.page('adminDrafts'), this.repository.page('rooms')]) });
}
