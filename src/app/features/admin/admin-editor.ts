import { Component, HostListener, effect, inject, input, resource, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CanDeactivateFn, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminRepository } from '../../core/infrastructure/firebase/admin.repository';
import { MAX_ADMIN_QUESTIONS, QuizDraft, newDraft, publicationErrors } from '../../core/domain/admin-quiz';
import { Button } from '../../shared/ui/button';
import { adminError } from './admin-error';

const text = (value = '', max = 2000) => new FormControl(value, { nonNullable: true, validators: [Validators.maxLength(max)] });
function questionForm(question?: QuizDraft['questions'][number], solution?: QuizDraft['solutions'][number]) {
  return new FormGroup({ id: text(question?.id ?? `q-${crypto.randomUUID()}`, 100),
    prompt: text(question?.prompt), options: new FormArray(['1', '2', '3', '4'].map((id) => text(question?.options.find((option) => option.id === id)?.text ?? '', 500))),
    correctOptionId: text(solution?.correctOptionId ?? '', 1), explanation: text(solution?.explanation ?? '', 4000), reference: text(solution?.reference ?? '', 1000) });
}
@Component({
  selector: 'app-admin-editor', imports: [ReactiveFormsModule, RouterLink, Button],
  styleUrl: './admin.scss', templateUrl: './admin-editor.html',
})
export class AdminEditor {
  readonly draftId = input.required<string>();
  private readonly repository = inject(AdminRepository);
  private readonly router = inject(Router);
  readonly loaded = resource({ params: () => this.draftId(), loader: ({ params }) => params === 'new' ? Promise.resolve(newDraft()) : this.repository.getDraft(params) });
  private original: QuizDraft | null = null;
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal(''); readonly preview = signal(false);
  readonly maximum = MAX_ADMIN_QUESTIONS;
  readonly form = new FormGroup({ title: text('', 120), description: text(), topic: text('', 80),
    difficulty: new FormControl<'beginner' | 'intermediate' | 'advanced'>('beginner', { nonNullable: true }),
    timeLimitSeconds: new FormControl(20, { nonNullable: true, validators: [Validators.min(5), Validators.max(120)] }),
    reviewed: new FormControl(false, { nonNullable: true }), questions: new FormArray<ReturnType<typeof questionForm>>([]) });
  readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  get questions() { return this.form.controls.questions; }
  constructor() {
    effect(() => {
      if (this.loaded.error()) return;
      const draft = this.loaded.value();
      if (!draft) return;
      this.original = draft;
      this.questions.clear({ emitEvent: false });
      for (const question of draft.questions) this.questions.push(questionForm(question,
        draft.solutions.find((solution) => solution.questionId === question.id)), { emitEvent: false });
      this.form.reset({ title: draft.quiz.title, description: draft.quiz.description, topic: draft.quiz.topic,
        difficulty: draft.quiz.difficulty, timeLimitSeconds: draft.quiz.defaultTimeLimitSeconds, reviewed: draft.reviewed,
        questions: this.questions.getRawValue() });
      this.form.markAsPristine();
    });
  }
  add() {
    if (this.questions.length >= this.maximum) return;
    this.questions.push(questionForm()); this.changed();
  }
  remove(index: number) { this.questions.removeAt(index); this.changed(); }
  move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= this.questions.length) return;
    const control = this.questions.at(index);
    this.questions.removeAt(index); this.questions.insert(target, control); this.changed();
  }
  private changed() { this.form.markAsDirty(); this.form.controls.reviewed.setValue(false); }
  unreview(event: Event) { if ((event.target as HTMLElement).id !== 'content-reviewed') this.form.controls.reviewed.setValue(false); }
  draft(): QuizDraft {
    if (!this.original) throw new Error('Черновик ещё не загружен.');
    const raw = this.form.getRawValue();
    return { ...this.original, reviewed: raw.reviewed,
      quiz: { ...this.original.quiz, title: raw.title.trim(), description: raw.description.trim(), topic: raw.topic.trim(),
        difficulty: raw.difficulty, defaultTimeLimitSeconds: raw.timeLimitSeconds, status: 'approved', questionIds: raw.questions.map((question) => question.id) },
      questions: raw.questions.map((question) => ({ id: question.id, quizId: this.original!.quiz.id, prompt: question.prompt.trim(),
        options: question.options.map((value, index) => ({ id: String(index + 1), text: value.trim() })),
        timeLimitSeconds: raw.timeLimitSeconds, status: 'approved' })),
      solutions: raw.questions.map((question) => ({ questionId: question.id, correctOptionId: question.correctOptionId,
        explanation: question.explanation.trim(), reference: question.reference.trim() })) };
  }
  errors() { this.values(); return this.original ? publicationErrors(this.draft()) : []; }
  async save(publish = false) {
    if (this.busy() || !this.original) return;
    this.error.set(''); this.notice.set(''); this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Проверьте длину полей и время вопроса.'); return; }
    const draft = this.draft();
    if (publish && publicationErrors(draft).length) { this.error.set(publicationErrors(draft).join(' ')); return; }
    this.busy.set(true);
    try {
      draft.revision = await this.repository.save(draft);
      this.original = draft;
      this.form.markAsPristine();
      if (publish) {
        await this.repository.publish(draft);
        this.original = { ...draft, revision: draft.revision + 1, baseVersion: draft.baseVersion + 1,
          quiz: { ...draft.quiz, version: draft.baseVersion + 1 } };
        this.notice.set(`Опубликована версия ${this.original.baseVersion}. Новые игры используют её; текущие игры сохранены.`);
      } else this.notice.set('Черновик сохранён. Игроки его не видят.');
      if (this.draftId() === 'new') await this.router.navigate(['/admin/edit', draft.id], { replaceUrl: true });
    } catch (error) { this.error.set(adminError(error)); }
    finally { this.busy.set(false); }
  }
  canLeave() { return !this.form.dirty || window.confirm('Есть несохранённые изменения. Покинуть редактор?'); }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.form.dirty) { event.preventDefault(); event.returnValue = ''; }
  }
}
export const unsavedDraftGuard: CanDeactivateFn<AdminEditor> = (component) => component.canLeave();
