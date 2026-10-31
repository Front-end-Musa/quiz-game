import { Component, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { EmptyState } from '../../shared/ui/empty-state';
import { Button } from '../../shared/ui/button';
import { Badge } from '../../shared/ui/badge';
import { PageHeader } from '../../shared/ui/page-header';
import { LoadingState } from '../../shared/ui/loading-state';
import { QuizArtwork } from '../../shared/ui/quiz-artwork';
import { QuizFacts } from '../../shared/ui/quiz-facts';

@Component({
  selector: 'app-quiz-detail-page',
  imports: [
    RouterLink,
    EmptyState,
    Button,
    Badge,
    PageHeader,
    LoadingState,
    QuizArtwork,
    QuizFacts,
  ],
  templateUrl: './quiz-detail.page.html',
})
export class QuizDetailPage {
  readonly quizId = input.required<string>();
  private readonly repository = inject(QUIZ_REPOSITORY);
  readonly detail = resource({
    params: () => this.quizId(),
    loader: async ({ params }) => ({
      quiz: await this.repository.get(params),
      questions: await this.repository.getQuestions(params),
    }),
  });
}
