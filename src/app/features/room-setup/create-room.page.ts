import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { ROOM_GATEWAY } from '../../core/ports/room-gateway';
import { defaultRoomSettings } from '../../core/domain/room-settings';
import { EmptyState } from '../../shared/ui/empty-state';
import { Button } from '../../shared/ui/button';
import { PageHeader } from '../../shared/ui/page-header';
import { LoadingState } from '../../shared/ui/loading-state';
import { FormField } from '../../shared/ui/form-field';
import { durationMinutes } from '../../shared/ui/quiz-presentation';
import { FirebaseConnection } from '../../core/infrastructure/firebase/firebase-connection';
import { GameDefaultsRepository } from '../../core/infrastructure/firebase/game-defaults.repository';
import { defaultsForQuiz } from '../../core/domain/admin-quiz';
import { RoomQuestionEditor } from '../../shared/ui/room-question-editor';
import { RoomQuestionSet, roomQuestionErrors, selectedRoomQuestions } from '../../core/domain/room-question-set';

const integer: ValidatorFn = (control) =>
  Number.isInteger(control.value) ? null : { integer: true };
const numeric = (value: number, min: number, max: number) =>
  new FormControl(value, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(min), Validators.max(max), integer],
  });

@Component({
  selector: 'app-create-room-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EmptyState,
    Button,
    PageHeader,
    LoadingState,
    FormField,
    RoomQuestionEditor,
  ],
  templateUrl: './create-room.page.html',
})
export class CreateRoomPage {
  readonly firebase = inject(FirebaseConnection, { optional: true });
  private readonly defaultsRepository = inject(GameDefaultsRepository, { optional: true });
  readonly defaults = resource({ loader: () => this.defaultsRepository?.get() ?? Promise.resolve(null) });
  readonly quizId = input.required<string>();
  private readonly quizzes = inject(QUIZ_REPOSITORY);
  private readonly rooms = inject(ROOM_GATEWAY);
  private readonly router = inject(Router);
  readonly quiz = resource({
    params: () => this.quizId(),
    loader: ({ params }) => this.quizzes.get(params),
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly customMode = signal(false);
  readonly initialQuestions = signal<RoomQuestionSet | null>(null);
  readonly editedQuestions = signal<RoomQuestionSet | null>(null);
  readonly availableQuestions = computed(() => this.customMode() ? this.editedQuestions()?.questions.length ?? 0 : this.quiz.hasValue() ? this.quiz.value()?.questionIds.length ?? 0 : 0);
  readonly form = new FormGroup(
    {
      hostNickname: new FormControl('Ведущий', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(24), Validators.pattern(/\S/)],
      }),
      minPlayers: numeric(2, 2, 15),
      questionCount: numeric(1, 1, 15),
      timeLimitSeconds: numeric(20, 5, 120),
      pointsPerCorrectAnswer: numeric(100, 1, 5000),
      speedBonusPoints: numeric(50, 0, 5000),
      maxPlayers: numeric(15, 2, 15),
    },
    {
      validators: (control) =>
        control.get('speedBonusPoints')!.value > control.get('pointsPerCorrectAnswer')!.value
          ? { bonusTooHigh: true }
          : control.get('minPlayers')!.value > control.get('maxPlayers')!.value
            ? { minimumTooHigh: true }
            : null,
    },
  );
  readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly estimate = computed(() =>
    durationMinutes(this.values().questionCount ?? 1, this.values().timeLimitSeconds ?? 20),
  );
  readonly fields = [
    {
      key: 'minPlayers',
      label: 'Минимум игроков для старта',
      min: 2,
      max: 15,
      hint: '2 для локального тестирования; для компании рекомендуем 8. Не больше лимита комнаты.',
    },
    {
      key: 'questionCount',
      label: 'Количество вопросов',
      min: 1,
      max: 15,
      hint: 'Возьмём первые вопросы в выбранном вами порядке. Состав и тексты можно изменить ниже.',
    },
    {
      key: 'timeLimitSeconds',
      label: 'Время на вопрос, секунд',
      min: 5,
      max: 120,
      hint: 'От 5 до 120 секунд. Дайте друзьям время подумать.',
    },
    {
      key: 'pointsPerCorrectAnswer',
      label: 'Очки за верный ответ',
      min: 1,
      max: 5000,
      hint: 'От 1 до 5 000. Неверный ответ — без штрафа.',
    },
    {
      key: 'speedBonusPoints',
      label: 'Максимальный бонус за скорость',
      min: 0,
      max: 5000,
      hint: '0 — без бонуса. Максимум не больше базовых очков.',
    },
    {
      key: 'maxPlayers',
      label: 'Максимум игроков',
      min: 2,
      max: 15,
      hint: 'От 2 до 15. Рекомендуем компанию из 8–15 друзей.',
    },
  ] as const;

  constructor() {
    effect(() => {
      if (this.quiz.error() || this.defaults.error()) return;
      const quiz = this.quiz.value();
      const defaults = this.defaults.value();
      if (quiz && !this.defaults.isLoading()) {
        this.form.controls.questionCount.setValidators([
          Validators.required,
          Validators.min(1),
          Validators.max(quiz.questionIds.length),
          integer,
        ]);
        this.form.reset({ ...(defaultsForQuiz(quiz, defaults ?? null) ?? defaultRoomSettings(quiz)), hostNickname: 'Ведущий' });
        this.error.set('');
        this.customMode.set(false); this.initialQuestions.set(null); this.editedQuestions.set(null);
      }
    });
    effect(() => {
      const available = this.availableQuestions();
      this.form.controls.questionCount.setValidators([Validators.required, Validators.min(1), Validators.max(available), integer]);
      this.form.controls.questionCount.updateValueAndValidity({ emitEvent: false });
    });
  }

  fieldError(key: keyof typeof this.form.controls): string {
    const control = this.form.controls[key];
    if (!control.touched || control.valid) return '';
    if (key === 'questionCount' && this.availableQuestions() < 1) return 'Добавьте хотя бы один вопрос.';
    if (key === 'questionCount')
      return `Введите целое число от 1 до ${this.availableQuestions()}.`;
    const field = this.fields.find((f) => f.key === key)!;
    return `Введите целое число от ${field.min} до ${field.max}.`;
  }

  reset() {
    const quiz = this.quiz.value();
    if (quiz) this.form.reset({ ...(defaultsForQuiz(quiz, this.defaults.value() ?? null) ?? defaultRoomSettings(quiz)), hostNickname: 'Ведущий' });
    this.error.set('');
    this.customMode.set(false); this.initialQuestions.set(null); this.editedQuestions.set(null);
  }

  async customizeQuestions() {
    const quiz = this.quiz.value();
    if (!quiz || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const result = await this.rooms.editableQuizQuestions(quiz.id, quiz.version);
      if (!result.ok) { this.error.set('Чтобы редактировать вопросы, войдите под разрешённой учётной записью ведущего.'); return; }
      if (this.quiz.value()?.id !== quiz.id) return;
      this.customMode.set(true); this.initialQuestions.set(result.value);
    } catch { this.error.set('Не удалось открыть вопросы. Проверьте соединение.'); }
    finally { this.busy.set(false); }
  }
  questionsChanged(content: RoomQuestionSet) {
    const previous = this.editedQuestions()?.questions.length;
    this.editedQuestions.set(content);
    if (previous !== content.questions.length) this.form.controls.questionCount.setValue(content.questions.length);
  }
  usePublishedQuestions() {
    this.customMode.set(false); this.initialQuestions.set(null); this.editedQuestions.set(null);
    const quiz = this.quiz.value();
    if (quiz) this.form.controls.questionCount.setValue((defaultsForQuiz(quiz, this.defaults.value() ?? null) ?? defaultRoomSettings(quiz)).questionCount);
    this.error.set('');
  }

  async create() {
    if (this.busy()) return;
    if (this.defaults.isLoading() || this.defaults.error()) {
      this.error.set('Не удалось загрузить настройки игры. Обновите настройки и повторите действие.'); return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || this.quiz.value()?.status === 'placeholder' && !this.customMode()) return;
    const content = this.customMode() && this.editedQuestions()
      ? selectedRoomQuestions(this.editedQuestions()!, this.form.controls.questionCount.value) : undefined;
    if (this.customMode() && !content) { this.error.set('Сначала добавьте вопросы для комнаты.'); return; }
    if (content && roomQuestionErrors(content, this.quizId()).length) { this.error.set(roomQuestionErrors(content, this.quizId()).join(' ')); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      const { hostNickname, ...settings } = this.form.getRawValue();
      const result = await this.rooms.create(this.quizId(), settings, hostNickname, content);
      if (result.ok) await this.router.navigate(['/lobby', result.value.code]);
      else
        this.error.set(
          result.error === 'invalid-settings'
            ? 'Проверьте настройки комнаты: одно из значений недопустимо.'
            : result.error === 'forbidden'
              ? 'Войдите через Google под разрешённой учётной записью ведущего.'
            : 'Комната не создана. Проверьте доступность викторины.',
        );
    } catch {
      this.error.set('Не удалось создать комнату. Попробуйте ещё раз.');
    } finally {
      this.busy.set(false);
    }
  }
}
