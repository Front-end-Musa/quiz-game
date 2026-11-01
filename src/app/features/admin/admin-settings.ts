import { Component, HostListener, effect, inject, resource, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AdminRepository } from '../../core/infrastructure/firebase/admin.repository';
import { GameDefaultsRepository } from '../../core/infrastructure/firebase/game-defaults.repository';
import { Button } from '../../shared/ui/button';
import { adminError } from './admin-error';
@Component({
  selector: 'app-admin-settings', imports: [ReactiveFormsModule, Button], styleUrl: './admin.scss',
  template: `<section class="stack"><h2>Настройки новых игр</h2><p>Текущие комнаты сохраняют свои настройки. Число вопросов ограничивается размером выбранного набора.</p>
    @if (defaults.isLoading()) { <p role="status">Загружаем настройки…</p> }
    @else if (defaults.error()) { <p role="alert">Настройки не загрузились.</p> }
    @else { <form class="panel stack" [formGroup]="form" (ngSubmit)="save()"><div class="admin-grid">
      @for (field of fields; track field.key) { <label>{{ field.label }}<input type="number" [formControlName]="field.key" [min]="field.min" [max]="field.max" required /></label> }
      </div><button appButton [disabled]="busy()">Сохранить настройки</button></form> }
    @if (error()) { <p role="alert">{{ error() }}</p> } @if (notice()) { <p role="status">{{ notice() }}</p> }
  </section>`,
})
export class AdminSettings {
  private readonly repository = inject(AdminRepository);
  private readonly defaultsRepository = inject(GameDefaultsRepository);
  readonly defaults = resource({ loader: () => this.defaultsRepository.get() });
  readonly fields = [
    { key: 'questionCount', label: 'Вопросов (1–15)', min: 1, max: 15 },
    { key: 'timeLimitSeconds', label: 'Время, секунд (5–120)', min: 5, max: 120 },
    { key: 'pointsPerCorrectAnswer', label: 'Базовые очки (1–5 000)', min: 1, max: 5000 },
    { key: 'speedBonusPoints', label: 'Бонус (0–базовые очки)', min: 0, max: 5000 },
    { key: 'minPlayers', label: 'Минимум игроков (2–лимит)', min: 2, max: 15 },
    { key: 'maxPlayers', label: 'Лимит игроков (2–15)', min: 2, max: 15 },
  ] as const;
  readonly form = new FormGroup({ questionCount: new FormControl(15, { nonNullable: true }),
    timeLimitSeconds: new FormControl(20, { nonNullable: true }), pointsPerCorrectAnswer: new FormControl(100, { nonNullable: true }),
    speedBonusPoints: new FormControl(50, { nonNullable: true }), minPlayers: new FormControl(2, { nonNullable: true }), maxPlayers: new FormControl(15, { nonNullable: true }) });
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal('');
  constructor() { effect(() => { if (this.defaults.error()) return; const value = this.defaults.value(); if (value) this.form.reset(value); }); }
  canLeave() { return !this.form.dirty || window.confirm('Настройки не сохранены. Покинуть страницу?'); }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.form.dirty) { event.preventDefault(); event.returnValue = ''; }
  }
  async save() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await this.repository.saveDefaults(this.form.getRawValue()); this.form.markAsPristine(); this.notice.set('Настройки сохранены для новых комнат.'); }
    catch (error) { this.error.set(adminError(error)); } finally { this.busy.set(false); }
  }
}
