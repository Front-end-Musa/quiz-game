import { Component, computed, inject, resource } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { EmptyState } from '../../shared/ui/empty-state';
import { QuizCard } from '../../shared/ui/quiz-card';
import { PageHeader } from '../../shared/ui/page-header';
import { LoadingState } from '../../shared/ui/loading-state';

@Component({
  selector: 'app-quiz-library-page',
  imports: [RouterLink, EmptyState, QuizCard, PageHeader, LoadingState],
  templateUrl: './quiz-library.page.html',
})
export class QuizLibraryPage {
  private readonly repository = inject(QUIZ_REPOSITORY);
  readonly quizzes = resource({ loader: () => this.repository.list() });
  readonly category = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('category') ?? '')),
    { initialValue: '' },
  );
  readonly categories = computed(() => [
    ...new Set(this.quizzes.value()?.map((q) => q.topic) ?? []),
  ]);
  readonly filtered = computed(
    () =>
      this.quizzes.value()?.filter((q) => !this.category() || q.topic === this.category()) ?? [],
  );
}
