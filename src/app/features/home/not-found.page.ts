import { Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state';
@Component({
  selector: 'app-not-found-page',
  imports: [EmptyState],
  template: `<h1>Кажется, свернули не туда</h1>
    <app-empty-state
      title="Такой страницы нет"
      message="Вернёмся туда, где собирается компания?"
      link="/"
      label="На главную"
    />`,
})
export class NotFoundPage {}
