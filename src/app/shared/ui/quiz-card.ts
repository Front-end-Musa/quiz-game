import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Quiz } from '../../core/domain/quiz';
import { Badge } from './badge';
import { QuizArtwork } from './quiz-artwork';
import { QuizFacts } from './quiz-facts';
@Component({
  selector: 'app-quiz-card',
  imports: [RouterLink, Badge, QuizArtwork, QuizFacts],
  template: `<article class="quiz-card">
    <a class="quiz-card-link" [routerLink]="['/quiz', quiz().id]"
      ><app-quiz-artwork [kind]="artKind()" />
      <div class="quiz-card-body">
        <div class="tile-meta">
          <span class="eyebrow">{{ quiz().topic }}</span
          ><app-badge [tone]="quiz().status === 'placeholder' ? 'pending' : 'success'">{{
            quiz().status === 'placeholder'
              ? 'Скоро · не проверено'
              : quiz().status === 'demo'
                ? 'Доступно · демо'
                : 'Доступно'
          }}</app-badge>
        </div>
        <h2>{{ quiz().title }}</h2>
        <p class="muted">{{ quiz().description }}</p>
        <app-quiz-facts [quiz]="quiz()" /><span class="card-action"
          >{{ quiz().status === 'placeholder' ? 'Узнать о викторине' : 'Смотреть викторину' }}
          <span aria-hidden="true">↗</span></span
        >
      </div></a
    >
  </article>`,
})
export class QuizCard {
  readonly quiz = input.required<Quiz>();
  readonly artKind = computed(() =>
    this.quiz().id === 'quran-three-surahs'
      ? 'quran'
      : this.quiz().id === 'programming-basics'
        ? 'code'
        : 'world',
  );
}
