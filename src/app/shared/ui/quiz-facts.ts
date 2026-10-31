import { Component, input } from '@angular/core';
import { Quiz } from '../../core/domain/quiz';
import { difficultyLabels, durationMinutes, questionLabel } from './quiz-presentation';
@Component({
  selector: 'app-quiz-facts',
  template: `<dl class="quiz-facts">
    <div>
      <dt>{{ quiz().status === 'placeholder' ? 'В подготовке' : 'В наборе' }}</dt>
      <dd>{{ questionLabel(quiz().questionIds.length) }}</dd>
    </div>
    <div>
      <dt>Ориентир по времени</dt>
      <dd>
        ≈ {{ durationMinutes(quiz().questionIds.length, quiz().defaultTimeLimitSeconds) }} мин
      </dd>
    </div>
    <div>
      <dt>{{ quiz().status === 'placeholder' ? 'Сложность · план' : 'Сложность' }}</dt>
      <dd>{{ labels[quiz().difficulty] }}</dd>
    </div>
  </dl>`,
})
export class QuizFacts {
  readonly quiz = input.required<Quiz>();
  readonly labels = difficultyLabels;
  readonly durationMinutes = durationMinutes;
  readonly questionLabel = questionLabel;
}
