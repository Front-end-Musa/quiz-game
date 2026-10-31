import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  imports: [RouterLink],
  template: `<section class="notice stack" aria-live="polite">
    <h2>{{ title() }}</h2>
    <p>{{ message() }}</p>
    <a class="button secondary" [routerLink]="link()">{{ label() }}</a>
  </section>`,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly link = input('/quizzes');
  readonly label = input('Выбрать викторину');
}
