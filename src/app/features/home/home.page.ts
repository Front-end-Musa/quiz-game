import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { Button } from '../../shared/ui/button';
import { Badge } from '../../shared/ui/badge';
import { QuizArtwork } from '../../shared/ui/quiz-artwork';
import { LoadingState } from '../../shared/ui/loading-state';
import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, Button, Badge, QuizArtwork, LoadingState, EmptyState],
  templateUrl: './home.page.html',
})
export class HomePage {
  private readonly quizzes = inject(QUIZ_REPOSITORY);
  readonly featured = resource({ loader: () => this.quizzes.get('quran-three-surahs') });
  readonly categories = ['Общие знания', 'Программирование', 'Кино', 'История', 'Наука'];
}
