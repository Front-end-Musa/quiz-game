import { Component, effect, input, output, untracked } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RoomQuestionSet, roomQuestionErrors } from '../../core/domain/room-question-set';
import { QuizQuestion, QuestionSolution } from '../../core/domain/quiz-question';

const text = (value = '') => new FormControl(value, { nonNullable: true });
function questionForm(question?: QuizQuestion, solution?: QuestionSolution) {
  return new FormGroup({ id: text(question?.id ?? `room-q-${crypto.randomUUID()}`), prompt: text(question?.prompt),
    options: new FormArray(['1', '2', '3', '4'].map((id) => text(question?.options.find((option) => option.id === id)?.text))),
    correctOptionId: text(solution?.correctOptionId), explanation: text(solution?.explanation), reference: text(solution?.reference) });
}

@Component({
  selector: 'app-room-question-editor', imports: [ReactiveFormsModule],
  styleUrl: './room-question-editor.scss', templateUrl: './room-question-editor.html',
})
export class RoomQuestionEditor {
  readonly initialContent = input.required<RoomQuestionSet>();
  readonly quizId = input.required<string>();
  readonly disabled = input(false);
  readonly contentChange = output<RoomQuestionSet>();
  readonly dirtyChange = output<boolean>();
  readonly form = new FormGroup({ questions: new FormArray<ReturnType<typeof questionForm>>([]),
    reviewed: new FormControl(false, { nonNullable: true }) });
  get questions() { return this.form.controls.questions; }
  constructor() {
    effect(() => {
      const initial = this.initialContent();
      untracked(() => {
        this.questions.clear();
        for (const question of initial.questions.filter((entry) => entry.status !== 'placeholder'))
          this.questions.push(questionForm(question, initial.solutions.find((solution) => solution.questionId === question.id)));
        this.form.controls.reviewed.setValue(initial.reviewed);
        this.form.markAsPristine();
        this.emit();
      });
    });
  }
  onInput(event: Event) {
    if ((event.target as HTMLElement).id !== 'room-content-reviewed') this.form.controls.reviewed.setValue(false);
    this.emit();
  }
  add(question?: QuizQuestion) {
    if (this.disabled() || this.questions.length >= 15) return;
    this.questions.push(questionForm(question, this.initialContent().solutions.find((solution) => solution.questionId === question?.id)));
    this.changed();
  }
  restore(id: string) { const question = this.initialContent().questions.find((entry) => entry.id === id); if (question) this.add(question); }
  removedQuestions() {
    const selected = new Set(this.questions.getRawValue().map((question) => question.id));
    return this.initialContent().questions.filter((question) => question.status !== 'placeholder' && !selected.has(question.id));
  }
  remove(index: number) { if (!this.disabled()) { this.questions.removeAt(index); this.changed(); } }
  move(index: number, direction: number) {
    const target = index + direction;
    if (this.disabled() || target < 0 || target >= this.questions.length) return;
    const question = this.questions.at(index); this.questions.removeAt(index); this.questions.insert(target, question); this.changed();
  }
  private changed() { this.form.markAsDirty(); this.form.controls.reviewed.setValue(false); this.emit(); }
  content(): RoomQuestionSet {
    const raw = this.form.getRawValue();
    return { revision: this.initialContent().revision ?? 0, reviewed: raw.reviewed,
      questions: raw.questions.map((question) => ({ id: question.id, quizId: this.quizId(), prompt: question.prompt.trim(),
        options: question.options.map((value, index) => ({ id: String(index + 1), text: value.trim() })),
        status: 'approved', timeLimitSeconds: 20 })),
      solutions: raw.questions.map((question) => ({ questionId: question.id, correctOptionId: question.correctOptionId,
        explanation: question.explanation.trim(), reference: question.reference.trim() })) };
  }
  errors() { return roomQuestionErrors(this.content(), this.quizId()); }
  private emit() { this.contentChange.emit(this.content()); this.dirtyChange.emit(this.form.dirty); }
  dirty() { return this.form.dirty; }
}
