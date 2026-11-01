import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ROOM_GATEWAY, RoomErrorCode } from '../../core/ports/room-gateway';
import { Button } from '../../shared/ui/button';
import { PageHeader } from '../../shared/ui/page-header';
import { FormField } from '../../shared/ui/form-field';
import { FirebaseConnection } from '../../core/infrastructure/firebase/firebase-connection';

const messages: Record<RoomErrorCode, string> = {
  'host-unavailable': 'Ведущий не ответил. Попросите его открыть комнату и попробуйте ещё раз.',
  'invalid-phase': 'Сейчас нельзя выполнить это действие.',
  'stale-round': 'Вопрос уже изменился.',
  'already-answered': 'Ответ уже принят.',
  'invalid-option': 'Такого варианта нет.',
  'answer-too-late': 'Время вышло.',
  forbidden: 'Это действие доступно только ведущему.',
  'not-enough-players': 'Для старта пока недостаточно игроков.',
  'player-not-found': 'Этот игрок уже покинул комнату.',
  'host-cannot-join':
    'Вы ведущий этой комнаты и не можете участвовать в зачёте. Вернитесь в своё лобби.',
  'storage-unavailable':
    'Не удалось сохранить изменение. Проверьте доступность хранилища браузера.',
  'development-only': 'Симуляция доступна только в режиме разработки.',
  'room-not-found': 'Комната не найдена. Проверьте код.',
  'room-full': 'В комнате больше нет свободных мест. Попросите ведущего проверить лимит игроков.',
  'name-taken': 'Это имя уже занято. Добавьте фамилию или выберите другое.',
  'invalid-name': 'Введите имя от 1 до 24 символов.',
  'game-started': 'Игра уже началась. Новые игроки пока не принимаются.',
  'quiz-not-found': 'Викторина не найдена.',
  'content-unavailable': 'Содержание ещё не подготовлено.',
  'invalid-settings': 'Настройки комнаты недопустимы. Обратитесь к ведущему.',
};
@Component({
  selector: 'app-join-page',
  imports: [ReactiveFormsModule, RouterLink, Button, PageHeader, FormField],
  templateUrl: './join.page.html',
})
export class JoinPage {
  readonly firebase = inject(FirebaseConnection, { optional: true });
  private readonly rooms = inject(ROOM_GATEWAY);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal<{ name: string; code: string } | null>(null);
  readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-zA-Z0-9]{6}$/)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(24), Validators.pattern(/\S/)],
    }),
  });
  fieldError(key: 'code' | 'name') {
    const control = this.form.controls[key];
    return control.touched && control.invalid
      ? key === 'code'
        ? 'Нужны ровно 6 латинских букв или цифр.'
        : 'Введите имя от 1 до 24 символов. Одних пробелов недостаточно.'
      : '';
  }
  normalizeCode() {
    this.form.controls.code.setValue(this.form.controls.code.value.trim().toUpperCase());
  }
  useDemo() {
    this.form.controls.code.setValue('DEMO22');
    this.error.set('');
  }
  async join() {
    if (this.busy() || this.success()) return;
    this.normalizeCode();
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const { code, name } = this.form.getRawValue();
      const result = await this.rooms.join(code, name);
      if (result.ok) this.success.set({ name: result.value.displayName, code });
      else this.error.set(messages[result.error]);
    } catch {
      this.error.set('Не удалось войти. Попробуйте ещё раз.');
    } finally {
      this.busy.set(false);
    }
  }
}
