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
  ],
  templateUrl: './create-room.page.html',
})
export class CreateRoomPage {
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
  readonly form = new FormGroup(
    {
      hostNickname: new FormControl('Ведущий', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(24), Validators.pattern(/\S/)],
      }),
      minPlayers: numeric(2, 2, 15),
      questionCount: numeric(1, 1, 15),
      timeLimitSeconds: numeric(20, 5, 120),
      pointsPerCorrectAnswer: numeric(1000, 100, 5000),
      speedBonusPoints: numeric(500, 0, 5000),
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
      hint: 'Возьмём первые вопросы набора, сохранив их порядок.',
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
      min: 100,
      max: 5000,
      hint: 'От 100 до 5 000. Неверный ответ — без штрафа.',
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
      const quiz = this.quiz.value();
      if (quiz) {
        this.form.controls.questionCount.setValidators([
          Validators.required,
          Validators.min(1),
          Validators.max(quiz.questionIds.length),
          integer,
        ]);
        this.form.reset({ ...defaultRoomSettings(quiz), hostNickname: 'Ведущий' });
        this.error.set('');
      }
    });
  }

  fieldError(key: keyof typeof this.form.controls): string {
    const control = this.form.controls[key];
    if (!control.touched || control.valid) return '';
    if (key === 'questionCount')
      return `Введите целое число от 1 до ${this.quiz.value()?.questionIds.length ?? 1}.`;
    const field = this.fields.find((f) => f.key === key)!;
    return `Введите целое число от ${field.min} до ${field.max}.`;
  }

  reset() {
    const quiz = this.quiz.value();
    if (quiz) this.form.reset({ ...defaultRoomSettings(quiz), hostNickname: 'Ведущий' });
    this.error.set('');
  }

  async create() {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || this.quiz.value()?.status === 'placeholder') return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { hostNickname, ...settings } = this.form.getRawValue();
      const result = await this.rooms.create(this.quizId(), settings, hostNickname);
      if (result.ok) await this.router.navigate(['/lobby', result.value.code]);
      else
        this.error.set(
          result.error === 'invalid-settings'
            ? 'Проверьте настройки комнаты: одно из значений недопустимо.'
            : 'Комната не создана. Проверьте доступность викторины.',
        );
    } catch {
      this.error.set('Не удалось создать комнату. Попробуйте ещё раз.');
    } finally {
      this.busy.set(false);
    }
  }
}
